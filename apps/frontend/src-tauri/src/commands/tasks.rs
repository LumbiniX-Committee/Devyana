use tauri::State;

use crate::db::models::{NewTask, Task};
use crate::models::tasks::{default_task_suggestions, TaskSuggestion};
use crate::state::AppState;

#[tauri::command]
pub async fn add_task(state: State<'_, AppState>, task: NewTask) -> Result<Task, String> {
    let inserted = crate::db::tasks_queries::insert_task(&state.db, &task).await?;
    let _ = crate::tasks::sync::broadcast_tasks(&state).await;
    Ok(inserted)
}

#[tauri::command]
pub async fn update_task(state: State<'_, AppState>, task: Task) -> Result<Task, String> {
    let updated = crate::db::tasks_queries::update_task(&state.db, &task).await?;
    let _ = crate::tasks::sync::broadcast_tasks(&state).await;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_task(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::db::tasks_queries::delete_task(&state.db, &id).await?;
    let _ = crate::tasks::sync::broadcast_tasks(&state).await;
    Ok(())
}

#[tauri::command]
pub async fn get_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    crate::db::tasks_queries::list_tasks(&state.db).await
}

/// Manually completes a pending task. Recurring tasks advance to their next
/// instance (the completed one stays marked, the fresh one is pending).
#[tauri::command]
pub async fn complete_task(state: State<'_, AppState>, id: String) -> Result<Task, String> {
    let completed = crate::db::tasks_queries::complete_with_recurrence(&state.db, &id).await?;
    let _ = crate::tasks::sync::broadcast_tasks(&state).await;
    Ok(completed)
}

/// Reopens a completed task (checkbox un-tick). No recurrence is generated.
#[tauri::command]
pub async fn reopen_task(state: State<'_, AppState>, id: String) -> Result<Task, String> {
    crate::db::tasks_queries::reopen_task(&state.db, &id).await?;
    let task = crate::db::tasks_queries::get_task(&state.db, &id)
        .await?
        .ok_or_else(|| format!("task {id} not found after reopening"))?;
    let _ = crate::tasks::sync::broadcast_tasks(&state).await;
    Ok(task)
}

/// Returns AI-suggested tasks built from the behavior graph and the user's
/// profile, falling back to a curated default set when the Intelligence Layer
/// is unreachable or unconfigured.
#[tauri::command]
pub async fn suggest_tasks(state: State<'_, AppState>) -> Result<Vec<TaskSuggestion>, String> {
    let settings = state.settings();

    let profile = match crate::db::queries::get_profile(&state.db).await? {
        Some(profile) => profile,
        None => return Ok(default_task_suggestions()),
    };

    let graph = crate::db::queries::latest_behavior_graph(&state.db)
        .await?
        .and_then(|g| serde_json::from_str::<serde_json::Value>(&g.graph_data).ok());

    let existing = crate::db::tasks_queries::recent_uncompleted_tasks(&state.db, 10).await?;
    let existing_json: Vec<serde_json::Value> = existing
        .iter()
        .map(|t| {
            serde_json::json!({
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "dueDate": t.due_date,
                "recurrenceRule": t.recurrence_rule,
            })
        })
        .collect();

    match crate::ai::client::suggest_tasks(
        &state.ai.http,
        &settings,
        &profile,
        graph.as_ref(),
        &existing_json,
    )
    .await
    {
        Ok(value) => {
            let parsed = parse_suggestions(&value);
            if parsed.is_empty() {
                Ok(default_task_suggestions())
            } else {
                Ok(parsed)
            }
        }
        Err(err) => {
            tracing::warn!(error = %err, "task suggestions fell back to defaults");
            Ok(default_task_suggestions())
        }
    }
}

/// Extracts `{ title, description, reason }` items from the Intelligence Layer
/// response. Accepts either `{ "suggestions": [...] }` or a bare array.
fn parse_suggestions(value: &serde_json::Value) -> Vec<TaskSuggestion> {
    let items = value
        .get("suggestions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_else(|| value.as_array().cloned().unwrap_or_default());

    items
        .into_iter()
        .filter_map(|item| {
            let title = item
                .get("title")
                .and_then(|v| v.as_str())
                .map(String::from)?;
            if title.trim().is_empty() {
                return None;
            }
            Some(TaskSuggestion {
                title,
                description: item
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                reason: item
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_wrapped_suggestions() {
        let value = serde_json::json!({
            "suggestions": [
                { "title": "Write", "description": "desc", "reason": "why" },
                { "title": "  " },
            ]
        });
        let out = parse_suggestions(&value);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].title, "Write");
        assert_eq!(out[0].description, "desc");
        assert_eq!(out[0].reason, "why");
    }

    #[test]
    fn parses_bare_array() {
        let value = serde_json::json!([
            { "title": "Meditate", "reason": "calm" }
        ]);
        let out = parse_suggestions(&value);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].title, "Meditate");
        assert_eq!(out[0].reason, "calm");
        assert_eq!(out[0].description, "");
    }

    #[test]
    fn returns_empty_for_garbage() {
        let out = parse_suggestions(&serde_json::json!({ "nope": true }));
        assert!(out.is_empty());
    }
}
