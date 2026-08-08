use tauri::State;

use crate::behavior::constraints::{ConstraintDefinition, Rule};
use crate::db::models::Constraint;
use crate::db::queries;
use crate::state::AppState;

#[tauri::command]
pub async fn get_constraints(state: State<'_, AppState>) -> Result<Vec<Constraint>, String> {
    queries::list_all_constraints(&state.db).await
}

#[tauri::command]
pub async fn add_constraint(state: State<'_, AppState>, json: String) -> Result<(), String> {
    let definition = serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|e| format!("constraint must be valid JSON: {e}"))?;

    let rule_id = if let Some(_rule) = definition.get("rule") {
        let parsed: ConstraintDefinition = serde_json::from_value(definition.clone())
            .map_err(|e| format!("invalid constraint definition: {e}"))?;
        if parsed.rule.id.trim().is_empty() {
            return Err("constraint rule requires an id".to_string());
        }
        if parsed.limit_ms <= 0 {
            return Err("constraint requires limitMs > 0".to_string());
        }
        parsed.rule.id
    } else {
        // A bare Rule JSON is accepted too (tracked but not enforced until a
        // limit is attached).
        let parsed: Rule = serde_json::from_value(definition)
            .map_err(|e| format!("invalid rule definition: {e}"))?;
        if parsed.id.trim().is_empty() {
            return Err("rule requires an id".to_string());
        }
        parsed.id
    };

    queries::insert_constraint(&state.db, &rule_id, &json).await?;
    tracing::info!(rule_id = %rule_id, "constraint added");
    Ok(())
}

#[tauri::command]
pub async fn remove_constraint(state: State<'_, AppState>, id: String) -> Result<(), String> {
    queries::delete_constraint(&state.db, &id).await?;
    tracing::info!(rule_id = %id, "constraint removed");
    Ok(())
}

#[tauri::command]
pub async fn get_pending_commands_count(state: State<'_, AppState>) -> Result<i32, String> {
    let count = queries::count_pending(&state.db).await?;
    Ok(count as i32)
}