use tauri::State;

use crate::db::analytics_queries as aq;
use crate::models::dashboard::{CorrectionAdvice, DailyBehavior, NegativeWorkItem};
use crate::state::AppState;

/// Returns the user behavior graph spanning the trailing `days` days: daily
/// productive vs. distracting minutes for the stacked area chart.
#[tauri::command]
pub async fn get_user_behavior_trend(
    state: State<'_, AppState>,
    days: Option<i32>,
) -> Result<Vec<DailyBehavior>, String> {
    aq::user_behavior_trend(&state.db, days.unwrap_or(30)).await
}

/// Summary of unwholesome activity categories over `[start_date, end_date]`,
/// with total time, session count, and a human-readable label.
#[tauri::command]
pub async fn get_negative_works(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<NegativeWorkItem>, String> {
    aq::negative_works(&state.db, &start_date, &end_date).await
}

/// Buddha-themed correction steps from the Intelligence Layer. Its local,
/// deterministic fallback ensures this command remains useful offline.
#[tauri::command]
pub async fn get_correction_advice(
    state: State<'_, AppState>,
    category: String,
) -> Result<CorrectionAdvice, String> {
    let mut bad_activities = aq::bad_activities_for_category(&state.db, &category).await?;
    if bad_activities.is_empty() {
        bad_activities.push(category.clone());
    }
    let outcome = crate::ai::intelligence_layer_client::IntelligenceLayerClient::from_settings(
        &state.settings(),
    )
    .get_monk_suggestions_with_status(bad_activities)
    .await;
    if outcome.used_fallback {
        state
            .ai_health
            .record("monk_suggestions", false, Some("local fallback used"));
    } else {
        state.ai_health.record("monk_suggestions", true, None);
    }

    let label = crate::models::dashboard::negative_work_description(&category);
    Ok(CorrectionAdvice {
        category,
        title: format!("Mindful Correction for {label}"),
        steps: outcome.value,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn local_advice_covers_known_categories() {
        let steps = crate::ai::intelligence_layer_client::fallback_monk_suggestions(&[
            "Social Media".to_string(),
        ]);
        assert_eq!(steps.len(), 4);
        assert!(steps[0].contains("Delete"));
    }
}
