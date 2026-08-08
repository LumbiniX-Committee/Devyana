use std::time::Duration;

use tokio::sync::mpsc;

use crate::db::models::Session;
use crate::models::analytics::SessionForAI;
use crate::state::AppState;

/// Upper bound on raw sessions drained per flush (protects the AI API from
/// unbounded payloads even if the DB has grown large while offline).
const MAX_BATCH_SIZE: i64 = 400;

/// Sessions whose end/start gap is within this tolerance are still considered
/// continuous and merged before sending.
const MERGE_GAP_MS: i64 = 60_000;

/// Strips identifying material from a URL before it leaves the machine:
/// removes the fragment and drops every query parameter unless the key is in
/// `whitelist` (e.g. `v` for a YouTube video id). Never panics on bad input.
pub fn sanitize_url_for_ai(raw: &str, whitelist: &[String]) -> String {
    let Ok(mut url) = url::Url::parse(raw) else {
        return raw.to_string();
    };

    if whitelist.is_empty() {
        url.set_query(None);
    } else {
        let kept = url
            .query_pairs()
            .filter(|(key, _)| whitelist.iter().any(|w| w == key))
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<Vec<_>>();
        url.set_query(None);
        for (key, value) in kept {
            url.query_pairs_mut().append_pair(&key, &value);
        }
    }

    url.set_fragment(None);
    url.to_string()
}

fn parse_matched_rules(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_else(|_| {
        raw.split(',')
            .map(|id| id.trim_matches('"').trim().to_string())
            .filter(|id| !id.is_empty())
            .collect()
    })
}

fn parse_meta(s: &Session, send_full_meta: bool) -> Option<serde_json::Value> {
    if !send_full_meta {
        return None;
    }
    s.meta
        .as_ref()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
}

/// Server-side compression mirroring the extension's offline aggregation:
/// consecutive sessions with the same hostname + category whose coverage is
/// near-continuous collapse into a single entry with a summed duration.
/// URLs are stripped of identifying query params/fragments per `whitelist`.
fn compress_sessions(
    sessions: &[Session],
    send_full_meta: bool,
    url_whitelist: &[String],
) -> Vec<SessionForAI> {
    let mut out: Vec<SessionForAI> = Vec::with_capacity(sessions.len());
    let mut current: Option<SessionForAI> = None;

    for s in sessions {
        let can_merge = current.as_ref().is_some_and(|c| {
            c.hostname == s.hostname
                && c.ai_category.as_deref() == s.ai_category.as_deref()
                && s.started_at >= c.ended_at
                && (s.started_at - c.ended_at) <= MERGE_GAP_MS
        });

        if can_merge {
            let entry = current.as_mut().expect("checked above");
            entry.ended_at = s.ended_at;
            entry.duration_ms = s.duration_ms.saturating_add(entry.duration_ms);
            entry.merged_count = entry.merged_count.saturating_add(s.aggregated_from.max(1));
        } else {
            if let Some(prev) = current.take() {
                out.push(prev);
            }
            current = Some(SessionForAI {
                id: s.id.clone(),
                client_id: s.client_id.clone(),
                url: sanitize_url_for_ai(&s.url, url_whitelist),
                hostname: s.hostname.clone(),
                pathname: s.pathname.clone(),
                meta: parse_meta(s, send_full_meta),
                duration_ms: s.duration_ms,
                ai_category: s.ai_category.clone(),
                started_at: s.started_at,
                ended_at: s.ended_at,
                matched_rules: parse_matched_rules(&s.matched_rules),
                primary_rule_id: s.primary_rule_id.clone(),
                merged_count: s.aggregated_from.max(1),
                preceded_by: None,
            });
        }
    }
    if let Some(prev) = current.take() {
        out.push(prev);
    }

    // Light local context: the category that immediately preceded each entry.
    let mut previous: Option<String> = None;
    for entry in &mut out {
        entry.preceded_by = previous.clone();
        previous = entry.ai_category.clone();
    }

    out
}

/// Calls `update_behavior_graph`. Retries with exponential backoff up to 3
/// retries (4 total attempts); returns `None` when the batch must be skipped.
async fn send_batch_with_retry(
    state: &AppState,
    user_id: &str,
    batch: &[SessionForAI],
) -> Option<serde_json::Value> {
    const MAX_ATTEMPTS: u32 = 4; // initial + 3 retries
    let settings = state.settings();

    let mut attempt = 0u32;
    let mut backoff = Duration::from_secs(2);

    loop {
        match crate::ai::client::update_behavior_graph_sessions(
            &state.ai.http,
            &settings,
            user_id,
            batch,
        )
        .await
        {
            Ok(graph) => return Some(graph),
            Err(err) => {
                tracing::warn!(
                    attempt = attempt + 1,
                    max_attempts = MAX_ATTEMPTS,
                    error = %err,
                    "AI graph update failed"
                );
                attempt += 1;
                if attempt >= MAX_ATTEMPTS {
                    return None;
                }
                tokio::time::sleep(backoff).await;
                backoff = backoff.saturating_mul(2);
            }
        }
    }
}

/// Records a flush in `ai_batches` for observability.
async fn log_batch(state: &AppState, ids: &[String], merged: usize, success: bool) {
    if ids.is_empty() {
        return;
    }
    let id = uuid::Uuid::new_v4().to_string();
    if let Err(err) = sqlx::query(
        "INSERT INTO ai_batches (id, batch_no, session_count, merged_count, success)
         VALUES (?, 0, ?, ?, ?)",
    )
    .bind(&id)
    .bind(ids.len() as i64)
    .bind(merged as i64)
    .bind(if success { 1 } else { 0 })
    .execute(&state.db)
    .await
    {
        tracing::debug!(error = %err, "could not log ai batch");
    }
}

/// Sends one compressed batch; on success persists the graph, marks the
/// sessions processed and applies any recommended constraints.
async fn send_flush(state: &AppState, user_id: &str, sessions: Vec<Session>) -> Result<(), String> {
    let settings = state.settings();
    let compressed = compress_sessions(&sessions, settings.ai_send_full_meta, &settings.ai_url_whitelist);
    let ids: Vec<String> = sessions.iter().map(|s| s.id.clone()).collect();

    let graph = match send_batch_with_retry(state, user_id, &compressed).await {
        Some(graph) => graph,
        None => {
            tracing::error!(
                sessions = ids.len(),
                "AI batch dropped after exhausting retries; sessions stay unprocessed"
            );
            log_batch(state, &ids, compressed.len(), false).await;
            return Ok(()); // skip the batch, never mark processed
        }
    };

    // Success: persist updated graph, mark sessions, apply recommendations.
    crate::behavior::graph::persist_graph_update(state, user_id, &graph).await?;

    let merged = compressed.len();
    crate::db::analytics_queries::mark_sessions_processed_tx(&state.db, &ids).await?;
    log_batch(state, &ids, merged, true).await;

    tracing::info!(
        user_id = %user_id,
        sessions = ids.len(),
        merged_entries = merged,
        "AI batch flushed and marked processed"
    );
    Ok(())
}

/// Top-level guard: if the AI graph endpoint is not configured yet, keep the
/// sessions unprocessed so they flush once the user supplies a key.
async fn send_flush_with_retry(
    state: &AppState,
    user_id: &str,
    sessions: Vec<Session>,
) -> Result<(), String> {
    if state.settings().ai_graph_url.trim().is_empty() {
        tracing::debug!(
            pending = sessions.len(),
            "AI graph URL unset; holding sessions (unprocessed)"
        );
        return Ok(());
    }
    send_flush(state, user_id, sessions).await
}

/// One attempt at draining the holding window. No-op if the batch does not
/// satisfy `min_size` nor `max_age`.
async fn try_flush(state: &AppState) -> Result<(), String> {
    let settings = state.settings();
    let min_size = settings.ai_batch_min_size.max(1);
    let max_age_ms = settings.ai_batch_max_age_secs.max(1) as i64 * 1000;

    let Some(profile) = crate::db::queries::get_profile(&state.db).await? else {
        tracing::debug!("no profile; holding AI batch until onboarding completes");
        return Ok(());
    };

    let sessions =
        crate::db::analytics_queries::pending_ai_sessions(&state.db, MAX_BATCH_SIZE).await?;
    if sessions.is_empty() {
        return Ok(());
    }

    let now_ms = chrono::Utc::now().timestamp_millis();
    let oldest = sessions.first().map(|s| s.started_at).unwrap_or(now_ms);
    let too_old = now_ms.saturating_sub(oldest) >= max_age_ms;

    if (sessions.len() as usize) < min_size && !too_old {
        tracing::debug!(
            pending = sessions.len(),
            min_size,
            oldest_age_secs = (now_ms.saturating_sub(oldest)) / 1000,
            max_age_secs = settings.ai_batch_max_age_secs,
            "holding window not ready; deferring AI flush"
        );
        return Ok(());
    }

    let batch = if (sessions.len() as i64) > MAX_BATCH_SIZE {
        sessions.into_iter().take(MAX_BATCH_SIZE as usize).collect()
    } else {
        sessions
    };

    send_flush_with_retry(state, &profile.id, batch).await
}

fn interval_for(state: &AppState) -> Duration {
    Duration::from_secs(state.settings().ai_batch_interval_secs.max(5))
}

/// Background loop: listens on both the interval tick and the
/// "new classified session" channel, flushing early when the holding window
/// fills or ages past the max.
/// Background loop: listens on both the interval tick and the
/// "new classified session" channel, flushing early when the holding window
/// fills or ages past the max.
pub async fn start_ai_batcher(state: AppState) {
    let mut notify_rx: mpsc::UnboundedReceiver<()> = {
        let mut guard = state.ai_batch_rx.lock().await;
        guard.take().expect("ai batcher started twice")
    };

    // The first tick of `tokio::time::interval` fires immediately; consume it
    // so subsequent ticks align to the configured interval.
    let mut ticker = tokio::time::interval(interval_for(&state));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                if let Err(err) = try_flush(&state).await {
                    tracing::warn!(error = %err, "scheduled AI flush failed");
                }
            }
            signal = notify_rx.recv() => {
                // Drain further signals queued while we were reacting.
                while notify_rx.try_recv().is_ok() {}
                if let Err(err) = try_flush(&state).await {
                    tracing::warn!(error = %err, "signalled AI flush failed");
                }
                if signal.is_none() {
                    // Sender dropped: the notifier is gone; keep polling on ticks.
                    tracing::debug!("AI batch notify channel closed; timer-only flushing");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(
        id: &str,
        hostname: &str,
        category: &str,
        start: i64,
        end: i64,
    ) -> Session {
        Session {
            id: id.to_string(),
            client_id: "c1".into(),
            browser_type: "chrome".into(),
            url: format!("https://{hostname}/path?token=SECRET"),
            hostname: hostname.to_string(),
            pathname: "/path".into(),
            meta: None,
            duration_ms: end - start,
            started_at: start,
            ended_at: end,
            matched_rules: "[\"a\"]".into(),
            primary_rule_id: Some("a".into()),
            tab_id: 0,
            aggregated_from: 1,
            ai_category: Some(category.to_string()),
            processed_for_graph: 0,
            recorded_at: "2026-08-08 10:00:00".into(),
        }
    }

    #[test]
    fn compress_merges_continuous_same_hostname_category() {
        let sessions = vec![
            session("1", "youtube.com", "learning", 1000, 2000),
            session("2", "youtube.com", "learning", 2100, 3000),
            // Different hostname breaks the run.
            session("3", "github.com", "coding", 3100, 4000),
            // Same hostname but different category breaks the run.
            session("4", "github.com", "social_media", 4100, 5000),
        ];
        let out = compress_sessions(&sessions, false, &[]);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].merged_count, 2, "first two merge");
        assert_eq!(out[0].duration_ms, 1900, "1s + 0.9s summed");
        assert_eq!(out[0].started_at, 1000, "merge keeps first start");
        assert_eq!(out[0].ended_at, 3000, "merge advances end");
        assert_eq!(out[1].merged_count, 1);
        assert_eq!(out[1].preceded_by.as_deref(), Some("learning"));
        assert_eq!(out[2].preceded_by.as_deref(), Some("coding"));
    }

    #[test]
    fn compress_does_not_merge_discontinuous() {
        let sessions = vec![
            session("1", "youtube.com", "learning", 1000, 2000),
            // 68 seconds of gap (> MERGE_GAP_MS) -> not continuous.
            session("2", "youtube.com", "learning", 70_000, 72_000),
        ];
        let out = compress_sessions(&sessions, false, &[]);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn compress_sanitizes_urls() {
        let whitelist = vec!["v".to_string()];
        let sessions = vec![
            session("1", "youtube.com", "learning", 1000, 2000),
            session("2", "youtube.com", "learning", 2100, 3000),
        ];
        let out = compress_sessions(&sessions, false, &whitelist);
        let sample = out.first().expect("one entry");
        assert!(!sample.url.contains("token"), "token stripped: {}", sample.url);
    }

    #[test]
    fn sanitize_strips_query_and_fragment_by_whitelist() {
        let whitelist = vec!["v".to_string()];
        let clean = sanitize_url_for_ai(
            "https://www.youtube.com/watch?v=abc123&token=SECRET#section",
            &whitelist,
        );
        assert!(!clean.contains("token"));
        assert!(!clean.contains("#section"));
        assert!(clean.contains("v=abc123"), "whitelisted param kept: {clean}");

        let stripped = sanitize_url_for_ai("https://x.com/p?token=SECRET#frag", &[]);
        assert_eq!(stripped, "https://x.com/p");
    }

    #[test]
    fn sanitize_leaves_bad_input_unchanged() {
        let raw = "not a url at all";
        assert_eq!(sanitize_url_for_ai(raw, &[]), raw);
    }
}
