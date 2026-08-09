pub mod client;

pub use client::AiClient;

use crate::state::AppState;

/// Kicks off an asynchronous page classification for a freshly recorded
/// session. Non-blocking: never delays the WebSocket ack.
pub fn spawn_classification(state: &AppState, session: crate::db::models::NewSession) {
    let state = state.clone();
    tauri::async_runtime::spawn(async move {
        match client::classify_session(&state, &session).await {
            Ok(category) => {
                state.ai_health.record("classify", true, None);
                tracing::info!(
                    session_id = %session.id,
                    %category,
                    "classified session"
                );
                if let Err(err) = crate::db::queries::update_session_ai_category(
                    &state.db,
                    &session.id,
                    &category,
                )
                .await
                {
                    tracing::warn!(error = %err, "could not persist ai_category");
                    return;
                }

                // Wake the AI batcher: a new classified session is queued.
                let _ = state.ai_batch_notify.send(());

                let updated = crate::db::models::NewSession {
                    category,
                    ..session
                };
                if let Err(err) =
                    crate::behavior::evaluator::evaluate_for_session(&state, &updated).await
                {
                    tracing::warn!(error = %err, "constraint evaluation after classification failed");
                }

                // Second auto-completion pass with the classified category, so
                // `ai_category`-based completion triggers can now match.
                let auto_state = state.clone();
                let auto_session = updated.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(err) =
                        crate::tasks::auto_complete::check_auto_complete(&auto_state, &auto_session)
                            .await
                    {
                        tracing::warn!(error = %err, "auto-completion after classification failed");
                    }
                });
            }
            Err(err) => {
                state.ai_health.record("classify", false, Some(&err.to_string()));
                tracing::warn!(session_id = %session.id, error = %err, "classification failed");
            }
        }
    });
}
