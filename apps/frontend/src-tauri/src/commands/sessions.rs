use serde::Serialize;
use tauri::State;

use crate::db::models::Session;
use crate::db::queries;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub id: String,
    pub client_id: String,
    pub browser_type: String,
    pub url: String,
    pub hostname: String,
    pub pathname: String,
    pub meta: serde_json::Value,
    pub duration_ms: i64,
    pub started_at: i64,
    pub ended_at: i64,
    pub matched_rules: Vec<String>,
    pub primary_rule_id: Option<String>,
    pub tab_id: i64,
    pub aggregated_from: i64,
    pub ai_category: Option<String>,
    pub recorded_at: String,
}

impl From<Session> for SessionView {
    fn from(s: Session) -> Self {
        let meta = s
            .meta
            .as_deref()
            .and_then(|raw| serde_json::from_str(raw).ok())
            .unwrap_or_else(|| serde_json::json!({}));
        let matched_rules = s
            .matched_rules
            .split(',')
            .map(|id| id.trim_matches('"').trim().to_string())
            .filter(|id| !id.is_empty())
            .collect();

        SessionView {
            id: s.id,
            client_id: s.client_id,
            browser_type: s.browser_type,
            url: s.url,
            hostname: s.hostname,
            pathname: s.pathname,
            meta,
            duration_ms: s.duration_ms,
            started_at: s.started_at,
            ended_at: s.ended_at,
            matched_rules,
            primary_rule_id: s.primary_rule_id,
            tab_id: s.tab_id,
            aggregated_from: s.aggregated_from,
            ai_category: s.ai_category,
            recorded_at: s.recorded_at,
        }
    }
}

#[tauri::command]
pub async fn get_sessions(
    state: State<'_, AppState>,
    limit: i32,
    offset: i32,
) -> Result<Vec<SessionView>, String> {
    let limit = limit.clamp(0, 500);
    let offset = offset.max(0);
    let rows = queries::list_sessions(&state.db, limit, offset).await?;
    Ok(rows.into_iter().map(SessionView::from).collect())
}

#[tauri::command]
pub async fn get_session_detail(
    state: State<'_, AppState>,
    id: String,
) -> Result<SessionView, String> {
    queries::get_session(&state.db, &id)
        .await?
        .map(SessionView::from)
        .ok_or_else(|| format!("session not found: {id}"))
}
