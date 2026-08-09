use tauri::State;

use crate::ai::intelligence_layer_client::IntelligenceLayerClient;
use crate::db::analytics_queries as aq;
use crate::models::learning::LearningPathway;
use crate::state::AppState;

/// Builds an open learning path with stable demo lessons. When recent activity
/// provides context, the Intelligence Layer tailors the reflective practices.
/// Its deterministic fallback preserves the same usable pathway offline.
#[tauri::command]
pub async fn get_learning_pathway(state: State<'_, AppState>) -> Result<LearningPathway, String> {
    let activities = aq::recent_learning_activities(&state.db).await?;
    let outcome = IntelligenceLayerClient::from_settings(&state.settings())
        .get_monk_suggestions_with_status(activities)
        .await;

    if outcome.used_fallback {
        state.ai_health.record(
            "learning_pathway",
            false,
            Some("default learning practices used"),
        );
    } else {
        state.ai_health.record("learning_pathway", true, None);
    }

    Ok(LearningPathway::demo(
        &outcome.value,
        !outcome.used_fallback,
    ))
}
