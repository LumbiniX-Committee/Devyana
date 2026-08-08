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
                tracing::info!(
                    session_id = %session.id,
                    %category,
                    "classified session"
                );
                if let Err(err) =
                    crate::db::queries::update_session_ai_category(&state.db, &session.id, &category).await
                {
                    tracing::warn!(error = %err, "could not persist ai_category");
                    return;
                }

                let updated = crate::db::models::NewSession { category, ..session };
                if let Err(err) = crate::behavior::evaluator::evaluate_for_session(&state, &updated).await {
                    tracing::warn!(error = %err, "constraint evaluation after classification failed");
                }
            }
            Err(err) => {
                tracing::warn!(session_id = %session.id, error = %err, "classification failed");
            }
        }
    });
}