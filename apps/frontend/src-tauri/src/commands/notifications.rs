use tauri::State;

use crate::db::models::{BehaviorGraph, Notification};
use crate::db::queries;
use crate::state::AppState;

#[tauri::command]
pub async fn get_behavior_graph(
    state: State<'_, AppState>,
) -> Result<BehaviorGraph, String> {
    queries::latest_behavior_graph(&state.db)
        .await?
        .ok_or_else(|| "no behavior graph exists yet".to_string())
}

#[tauri::command]
pub async fn get_notifications(state: State<'_, AppState>) -> Result<Vec<Notification>, String> {
    queries::list_notifications(&state.db).await
}