use std::net::SocketAddr;

use futures_util::{SinkExt, StreamExt};
use tauri::Emitter;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::Message;

use crate::db::models::NewSession;
use crate::db::queries;
use crate::state::AppState;
use crate::websocket::protocol::{ClientMessage, EventEnvelope, VinayaEvent};

/// Handles a single WebSocket connection: origin check, handshake, event loop
/// with batched acks, and cleanup on disconnect.
pub async fn handle_connection(state: AppState, stream: TcpStream, peer: SocketAddr) {
    let allowed = state.settings().allowed_origins;

    let ws = match accept_hdr_async(
        stream,
        |request: &tokio_tungstenite::tungstenite::http::Request<()>,
         response: tokio_tungstenite::tungstenite::http::Response<()>| {
            if !allowed.is_empty() {
                if let Some(origin) = request
                    .headers()
                    .get("Origin")
                    .and_then(|v| v.to_str().ok())
                {
                    if !allowed.iter().any(|prefix| origin.starts_with(prefix)) {
                        tracing::debug!(%origin, "websocket origin rejected");
                        let resp = tokio_tungstenite::tungstenite::http::Response::builder()
                            .status(403)
                            .body(None)
                            .expect("valid 403 response");
                        return Err(resp);
                    }
                }
            }
            Ok(response)
        },
    )
    .await
    {
        Ok(ws) => ws,
        Err(err) => {
            tracing::debug!(%peer, error = %err, "websocket upgrade rejected");
            return;
        }
    };

    let (tx, mut rx) = mpsc::channel(64);
    let (mut sink, mut stream) = ws.split();

    // Writer task: drains the outbound channel into the socket.
    let writer = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
    });

    let mut client_id: Option<String> = None;
    let mut pending_acks: Vec<String> = Vec::new();
    let ack_batch = state.settings().ack_batch_size.max(1);

    loop {
        let item = match stream.next().await {
            Some(Ok(item)) => item,
            Some(Err(err)) => {
                tracing::debug!(%peer, error = %err, "websocket read error");
                break;
            }
            None => break,
        };

        match item {
            Message::Text(text) => {
                let text = text.as_str();
                match ClientMessage::parse(text) {
                    Ok(ClientMessage::Handshake(h)) => {
                        tracing::info!(
                            client_id = %h.client_id,
                            browser_type = %h.browser_type,
                            version = %h.extension_version,
                            "handshake received"
                        );
                        client_id = Some(h.client_id.clone());
                        state.registry.register(h.client_id.clone(), tx.clone());
                        let _ = state.app.emit("browser_connected", &h.client_id);
                        // Fresh client: hand it the current task list so the
                        // "What did you intend to do?" overlay is populated
                        // even before the user touches the dashboard.
                        let handshake_state = state.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(err) =
                                crate::tasks::sync::broadcast_tasks(&handshake_state).await
                            {
                                tracing::warn!(error = %err, "task handshake sync failed");
                            }
                        });
                        if let Err(err) = flush_pending_for_client(&state, &tx, &h.client_id).await
                        {
                            tracing::warn!(error = %err, "failed to flush pending commands");
                        }
                    }
                    Ok(ClientMessage::Event(env)) => {
                        let immediate = process_event(&state, client_id.as_deref(), &env).await;
                        pending_acks.push(env.entry_id.clone());
                        if immediate || pending_acks.len() >= ack_batch {
                            let ids = std::mem::take(&mut pending_acks);
                            let ack = serde_json::json!({ "type": "ack", "ids": ids }).to_string();
                            if tx.send(Message::Text(ack.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(err) => {
                        tracing::warn!(error = %err, "unparseable client message");
                    }
                }
            }
            Message::Close(_) | Message::Binary(_) | Message::Frame(_) => break,
            _ => {}
        }
    }

    if let Some(id) = &client_id {
        state.registry.remove(id);
        let _ = state.app.emit("browser_disconnected", id);
        tracing::info!(client_id = %id, "client disconnected");
    }

    drop(tx);
    let _ = writer.await;
}

/// Handles one event envelope. Returns `true` when the ack must be sent
/// immediately (session_end / rule_violation / system_event).
async fn process_event(state: &AppState, client_id: Option<&str>, env: &EventEnvelope) -> bool {
    match &env.event {
        VinayaEvent::SessionEnd(event) => {
            tracing::info!(
                entry_id = %env.entry_id,
                client_id = %event.client_id,
                hostname = %event.hostname,
                duration_ms = event.duration_ms,
                "session_end received"
            );
            let meta = if event.meta.is_null()
                || event
                    .meta
                    .as_object()
                    .map(|o| o.is_empty())
                    .unwrap_or(false)
            {
                state
                    .consume_page_meta(&event.client_id, &event.url)
                    .unwrap_or_else(|| event.meta.clone())
            } else {
                event.meta.clone()
            };

            let new_session = NewSession {
                id: uuid::Uuid::new_v4().to_string(),
                client_id: event.client_id.clone(),
                browser_type: event.browser_type.clone(),
                url: event.url.clone(),
                hostname: event.hostname.clone(),
                pathname: event.pathname.clone(),
                meta: if meta.is_null() || meta.as_object().map(|o| o.is_empty()).unwrap_or(false) {
                    None
                } else {
                    Some(meta)
                },
                duration_ms: event.duration_ms,
                started_at: event.started_at,
                ended_at: event.end_at,
                matched_rules: event.rule_ids.clone(),
                primary_rule_id: event.primary_rule_id.clone(),
                tab_id: event.tab_id,
                aggregated_from: event.aggregated_from,
                category: event.category.clone(),
            };

            // Shared pipeline (insert + evaluation + auto-completion + AI
            // classification) — same code path the desktop tracker uses.
            if let Err(err) = crate::event_processor::handle_session_end(state, new_session).await
            {
                tracing::error!(entry_id = %env.entry_id, error = %err, "failed to store session");
            }
            true
        }
        VinayaEvent::FocusLost => {
            log_focus(state, client_id, "lost").await;
            false
        }
        VinayaEvent::FocusGained => {
            log_focus(state, client_id, "gained").await;
            false
        }
        VinayaEvent::PageMetaScanned { url, meta } => {
            if let Some(client_id) = client_id {
                state.buffer_page_meta(client_id, url, meta.clone());
            }
            false
        }
        VinayaEvent::RuleViolation {
            rule_id,
            url,
            message,
            meta: _,
        } => {
            tracing::info!(
                rule_id = ?rule_id,
                url = ?url,
                message = ?message,
                "rule violation reported by client"
            );
            let body = message
                .clone()
                .unwrap_or_else(|| "A behavioral rule was violated".to_string());
            if let Err(err) =
                queries::insert_notification(&state.db, "Rule violation", &body, "rule_violation")
                    .await
            {
                tracing::warn!(error = %err, "failed to record rule violation notification");
            }
            true
        }
        VinayaEvent::SystemEvent {
            name,
            message,
            data,
        } => {
            tracing::info!(
                name = %name,
                message = ?message,
                data = ?data,
                "system event from client"
            );
            true
        }
    }
}

async fn log_focus(state: &AppState, client_id: Option<&str>, kind: &str) {
    let Some(cid) = client_id else {
        return;
    };
    if let Err(err) =
        queries::insert_focus_log(&state.db, cid, kind, chrono::Utc::now().timestamp_millis()).await
    {
        tracing::debug!(error = %err, "focus log insert failed");
    }
}

/// On (re)connect, delivers every undelivered command queued for the client.
async fn flush_pending_for_client(
    state: &AppState,
    tx: &mpsc::Sender<Message>,
    client_id: &str,
) -> Result<(), String> {
    let commands = queries::pending_for_client(&state.db, client_id).await?;
    for command in commands {
        if tx
            .send(Message::Text(command.payload.clone().into()))
            .await
            .is_err()
        {
            tracing::warn!(client_id = %client_id, "client vanished mid-flush");
            return Ok(());
        }
        queries::mark_command_delivered(&state.db, &command.id).await?;
    }
    Ok(())
}
