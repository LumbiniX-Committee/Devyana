pub mod client;
pub mod intelligence_layer_client;

pub use client::AiClient;

use crate::state::AppState;

/// Kicks off an asynchronous page classification for a freshly recorded
/// session. Non-blocking: never delays the WebSocket ack.
pub fn spawn_classification(state: &AppState, session: crate::db::models::NewSession) {
    let state = state.clone();
    tauri::async_runtime::spawn(async move {
        let session_data = intelligence_layer_client::session_data_from_session(&session);
        let known_category = (!session.category.trim().is_empty()
            && session.category != crate::desktop_tracker::PLACEHOLDER_CATEGORY)
            .then(|| session.category.clone());
        let outcome = if let Some(category) = known_category {
            tracing::debug!(session_id = %session.id, %category, "using category supplied by rule");
            intelligence_layer_client::ResilientResult {
                value: vec![intelligence_layer_client::SessionAiResult {
                    session_id: session.id.clone(),
                    bad_topic: intelligence_layer_client::fallback_bad_topic_for_url(&session_data.url),
                    category,
                }],
                used_fallback: false,
            }
        } else {
            intelligence_layer_client::IntelligenceLayerClient::from_settings(&state.settings())
                .classify_sessions_with_status(vec![session_data])
                .await
        };

        let Some(result) = outcome.value.into_iter().next() else {
            state.ai_health.record("classify", false, Some("classification returned no result"));
            tracing::error!(session_id = %session.id, "classification returned no result");
            return;
        };
        if outcome.used_fallback {
            state.ai_health.record("classify", false, Some("local fallback used"));
            tracing::warn!(session_id = %session.id, category = %result.category, "stored fallback classification");
        } else {
            state.ai_health.record("classify", true, None);
            tracing::info!(session_id = %session.id, category = %result.category, bad_topic = ?result.bad_topic, "classified session");
        }

        if let Err(err) = crate::db::queries::update_session_ai_result(
            &state.db,
            &session.id,
            &result.category,
            result.bad_topic.as_deref(),
        )
        .await
        {
            tracing::warn!(error = %err, "could not persist Intelligence Layer result");
            return;
        }

        let updated = crate::db::models::NewSession {
            category: result.category,
            ..session
        };
        if let Err(err) = crate::behavior::evaluator::evaluate_for_session(&state, &updated).await {
            tracing::warn!(error = %err, "constraint evaluation after classification failed");
        }

        // Second auto-completion pass with the classified category, so
        // `ai_category`-based completion triggers can now match.
        if let Err(err) = crate::tasks::auto_complete::check_auto_complete(&state, &updated).await {
            tracing::warn!(error = %err, "auto-completion after classification failed");
        }
    });
}
