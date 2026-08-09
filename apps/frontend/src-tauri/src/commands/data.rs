use serde_json::json;
use sqlx::{Row, SqlitePool};
use tauri::State;

use crate::state::AppState;

/// Every user-owned table in the archive / wipe surface. Ordered so that
/// child rows are removed before parents when foreign keys are enabled.
const USER_TABLES: &[&str] = &[
    "pending_commands",
    "tasks",
    "focus_log",
    "ai_batches",
    "daily_summaries",
    "notifications",
    "behavior_graph",
    "constraints",
    "sessions",
    "user_profile",
];

/// Columns that hold serialized JSON and should be embedded (not double
/// quoted) when the archive is built.
const JSON_COLUMNS: &[&str] = &[
    "meta",
    "matched_rules",
    "goals",
    "graph_data",
    "rule_definition",
    "payload",
    "completion_trigger",
];

fn is_json_column(name: &str) -> bool {
    JSON_COLUMNS.contains(&name)
}

async fn table_columns(pool: &SqlitePool, table: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query(&format!("PRAGMA table_info(\"{table}\")"))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("inspect {table}: {e}"))?;
    Ok(rows.iter().map(|r| r.get::<String, _>("name")).collect())
}

/// Dumps one table as a JSON array of objects via `json_object`, embedding
/// known JSON columns so nested data survives round-tripping.
async fn dump_table(pool: &SqlitePool, table: &str) -> Result<serde_json::Value, String> {
    let cols = table_columns(pool, table).await?;
    if cols.is_empty() {
        return Ok(json!([]));
    }

    let mut keys = Vec::with_capacity(cols.len() * 2);
    for col in &cols {
        keys.push(format!("'{col}'"));
        if is_json_column(col) {
            keys.push(format!("json({col})"));
        } else {
            keys.push(col.clone());
        }
    }

    let sql = format!(
        "SELECT COALESCE(json_group_array(json_object({})), '[]') AS payload FROM \"{table}\"",
        keys.join(", ")
    );
    let row = sqlx::query(&sql)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("dump {table}: {e}"))?;

    row.try_get::<serde_json::Value, _>("payload")
        .map_err(|e| format!("parse {table} archive: {e}"))
}

/// Exports every user-owned table as a single JSON archive string. The UI
/// turns this into a downloadable `.json` file.
#[tauri::command]
pub async fn export_data(state: State<'_, AppState>) -> Result<String, String> {
    let mut archive = serde_json::Map::new();
    for table in USER_TABLES {
        let value = dump_table(&state.db, table).await?;
        archive.insert((*table).to_string(), value);
    }
    archive.insert(
        "exportedAt".to_string(),
        json!(chrono::Utc::now().to_rfc3339()),
    );

    serde_json::to_string_pretty(&serde_json::Value::Object(archive))
        .map_err(|e| format!("serialize archive: {e}"))
}

/// Permanently deletes every user-owned row. The profile is removed first so
/// the startup guard routes back into onboarding on the next launch.
#[tauri::command]
pub async fn clear_all_data(state: State<'_, AppState>) -> Result<(), String> {
    for table in USER_TABLES {
        sqlx::query(&format!("DELETE FROM \"{table}\""))
            .execute(&state.db)
            .await
            .map_err(|e| format!("clear {table}: {e}"))?;
    }
    tracing::info!("all user data cleared");
    Ok(())
}