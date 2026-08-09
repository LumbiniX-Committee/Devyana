use tauri::State;

use crate::db::analytics_queries as aq;
use crate::models::tasks::DayProductivity;
use crate::state::AppState;

/// Returns one entry per day (inclusive range) with normalised productivity
/// for the GitHub-style contribution grid. Dates without tracked activity are
/// returned with a zeroed score.
#[tauri::command]
pub async fn get_productivity_grid(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<DayProductivity>, String> {
    crate::db::summaries::day_keys(&start_date, &end_date)?;
    aq::productivity_grid(&state.db, &start_date, &end_date).await
}