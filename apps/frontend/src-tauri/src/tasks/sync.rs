//! Pushes the task list to connected browser extensions.

use tokio_tungstenite::tungstenite::Message;

use crate::behavior::constraints::DesktopCommand;
use crate::state::AppState;

/// Reads the current pending tasks and broadcasts them to every connected
/// extension through the `update_tasks` desktop command. Best-effort: the
/// extension caches the list locally, so offline clients pick it up the way
/// rule updates do (on demand).
/// Fire-and-forget broadcast intended for hot paths (auto-completion). Logs
/// failures instead of returning them.
pub async fn broadcast_tasks_best_effort(state: &AppState) {
    if let Err(err) = broadcast_tasks(state).await {
        tracing::warn!(error = %err, "failed to broadcast task list");
    }
}

pub async fn broadcast_tasks(state: &AppState) -> Result<(), String> {
    let tasks = crate::db::tasks_queries::list_tasks(&state.db).await?;

    let ext_tasks: Vec<crate::models::tasks::ExtensionTask> = tasks
        .iter()
        .filter(|t| t.status == "pending")
        .map(crate::models::tasks::ExtensionTask::from_task)
        .collect();

    let command = DesktopCommand::UpdateTasks { tasks: ext_tasks };
    let payload = serde_json::to_string(&command).map_err(|e| e.to_string())?;

    state
        .registry
        .broadcast(Message::Text(payload.into()))
        .await;

    tracing::debug!("broadcast update_tasks to extension clients");
    Ok(())
}
