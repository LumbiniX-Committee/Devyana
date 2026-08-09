use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub client_id: String,
    pub browser_type: String,
    pub url: String,
    pub hostname: String,
    pub pathname: String,
    pub meta: Option<String>,
    pub duration_ms: i64,
    pub started_at: i64,
    pub ended_at: i64,
    pub matched_rules: String,
    pub primary_rule_id: Option<String>,
    pub tab_id: i64,
    pub aggregated_from: i64,
    pub ai_category: Option<String>,
    pub processed_for_graph: i64,
    pub recorded_at: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub gender: String,
    pub age: i64,
    pub profession: String,
    pub goals: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOnboardingInput {
    pub id: String,
    pub gender: String,
    pub age: i64,
    pub profession: String,
    pub goals: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfileInput {
    pub gender: String,
    pub age: i64,
    pub profession: String,
    pub goals: Vec<String>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorGraph {
    pub id: String,
    pub user_id: Option<String>,
    pub graph_data: String,
    pub version: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constraint {
    pub id: String,
    pub rule_definition: String,
    pub enabled: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCommand {
    pub id: String,
    pub client_id: String,
    pub command_type: String,
    pub payload: String,
    pub created_at: String,
    pub delivered: i64,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub user_id: Option<String>,
    pub title: String,
    pub body: String,
    pub kind: String,
    pub scheduled_at: Option<String>,
    pub sent: i64,
}

/// Aggregated daily rollup row (`daily_summaries`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySummaryMetrics {
    pub date: String,
    pub total_focus_ms: i64,
    pub total_distraction_ms: i64,
    pub distraction_count: i64,
    pub session_count: i64,
    pub top_distraction_site: Option<String>,
    pub top_distraction_ms: i64,
}

/// Full task row. `completion_trigger` and the derived fields are stored as
/// JSON/text in the DB and surfaced as-is (the frontend parses the trigger).
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub due_date: Option<String>,
    pub recurrence_rule: Option<String>,
    pub parent_task_id: Option<String>,
    pub energy_level: Option<String>,
    pub completion_trigger: Option<String>,
    pub completed_at: Option<String>,
    pub user_id: Option<String>,
}

/// Input payload for creating a task (id/status/timestamps are generated).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub title: String,
    pub description: Option<String>,
    pub due_date: Option<String>,
    pub recurrence_rule: Option<String>,
    pub energy_level: Option<String>,
    pub completion_trigger: Option<serde_json::Value>,
    pub user_id: Option<String>,
}

/// Everything captured from a `session_end` event before it hits the DB.
#[derive(Debug, Clone)]
pub struct NewSession {
    pub id: String,
    pub client_id: String,
    pub browser_type: String,
    pub url: String,
    pub hostname: String,
    pub pathname: String,
    pub meta: Option<serde_json::Value>,
    pub duration_ms: i64,
    pub started_at: i64,
    pub ended_at: i64,
    pub matched_rules: Vec<String>,
    pub primary_rule_id: Option<String>,
    pub tab_id: i64,
    pub aggregated_from: Option<i64>,
    pub category: String,
}