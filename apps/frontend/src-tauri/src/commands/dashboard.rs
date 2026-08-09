use std::collections::HashMap;
use std::sync::OnceLock;

use tauri::State;

use crate::db::analytics_queries as aq;
use crate::models::dashboard::{CorrectionAdvice, DailyBehavior, NegativeWorkItem};
use crate::state::AppState;

/// Bundled correction advice, decoded once (first access = startup path) into
/// a static map keyed by `ai_category`. Embedded via `include_str!` so the app
/// ships a self-contained binary; a generic fallback covers unknown categories.
fn advice_map() -> &'static HashMap<String, CorrectionAdvice> {
    static MAP: OnceLock<HashMap<String, CorrectionAdvice>> = OnceLock::new();
    MAP.get_or_init(|| {
        let raw = include_str!("../../resources/correction_advice.json");
        serde_json::from_str::<HashMap<String, CorrectionAdvice>>(raw)
            .unwrap_or_else(|err| {
                tracing::error!(%err, "failed to parse bundled correction advice");
                HashMap::new()
            })
    })
}

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

/// Buddha-themed correction steps for a negative category. Unknown categories
/// receive a generic mindful redirection instead of an error, so the dashboard
/// never fails to guide the user back onto the path.
#[tauri::command]
pub async fn get_correction_advice(category: String) -> Result<CorrectionAdvice, String> {
    let map = advice_map();
    let key = if map.contains_key(&category) {
        category.as_str()
    } else {
        "generic"
    };
    map.get(key)
        .cloned()
        .ok_or_else(|| "correction advice unavailable".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_advice_covers_known_categories() {
        let map = advice_map();
        assert!(map.contains_key("dopamine_shorts"));
        assert!(map.contains_key("social_media"));
        assert!(map.contains_key("gambling"));
        assert!(map.contains_key("adult_content"));
        assert!(map.contains_key("gaming"));
    }

    #[test]
    fn bundled_advice_steps_are_nonempty() {
        let entry = advice_map().get("dopamine_shorts").expect("entry");
        assert!(!entry.title.is_empty());
        assert!(!entry.steps.is_empty());
        assert!(entry.steps[0].contains("breath"));
    }
}