use serde::{Deserialize, Serialize};

/// Pre-computed summary of a single day's focus behaviour.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSummary {
    /// Local calendar day, `YYYY-MM-DD`.
    pub date: String,
    /// Millis spent in "productive" categories (deep_work, learning, ...).
    pub total_focus_ms: i64,
    /// Millis spent in "distracting" categories (social_media, dopamine_shorts, ...).
    pub total_distraction_ms: i64,
    /// Estimated number of focus blocks: long uninterrupted productive work
    /// sessions (>= FOCUS_BLOCK_MIN_MS).
    pub focus_blocks: i64,
    /// Number of sessions whose ai_category is distracting.
    pub distraction_episodes: i64,
    /// Hostname that swallowed the most focused-distraction time that day.
    pub most_distracting_site: Option<String>,
    /// Duration (ms) of `most_distracting_site`.
    pub most_distracting_ms: i64,
}

/// One day inside a weekly report.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReport {
    pub date: String,
    pub total_focus_ms: i64,
    pub total_distraction_ms: i64,
    pub distraction_episodes: i64,
}

/// Trend direction of focus time across the reported window.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FocusTrend {
    Up,
    Down,
    Flat,
}

/// Aggregate of a single site (hostname) over a range.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteStat {
    pub hostname: String,
    pub total_ms: i64,
    pub session_count: i64,
}

/// Seven consecutive daily summaries plus trend/rankings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyReport {
    pub start_date: String,
    /// Inclusive end date = start_date + 6 days.
    pub end_date: String,
    pub days: Vec<DailyReport>,
    pub total_focus_ms: i64,
    pub total_distraction_ms: i64,
    pub focus_trend: FocusTrend,
    pub top_distractions: Vec<SiteStat>,
    pub top_productive_sites: Vec<SiteStat>,
    /// Average number of distraction episodes per day over the window.
    pub avg_daily_distraction_count: f64,
}

/// Completion/adherence metrics for a habit (stored via the notifications
/// table, keyed by `kind`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitAdherence {
    pub habit_id: String,
    pub start_date: String,
    pub end_date: String,
    /// Calendar days in the window (inclusive).
    pub total_days: i64,
    /// Days with at least one recorded completion for the habit.
    pub completed_days: i64,
    pub missed_days: i64,
    /// completed / total, 0..=1.
    pub completion_rate: f64,
    /// Longest run of consecutive completed days.
    pub longest_streak: i64,
    /// Consecutive completed days ending at the close of the window.
    pub current_streak: i64,
}

/// A constraint surfaced to the dashboard snapshot (parsed from rule JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveConstraint {
    pub id: String,
    pub rule_id: String,
    pub action: String,
    pub scope: String,
    pub limit_ms: i64,
}

/// Focus mode status derived from the latest focus_log event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusModeStatus {
    pub active: bool,
    /// Epoch ms of the event that established the current state.
    pub since_ms: Option<i64>,
}

/// Active intervention cooldown (MVP: no cooldowns are persisted yet, so the
/// list is empty until the extension surfaces them).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CooldownStatus {
    pub rule_id: String,
    /// Epoch ms until which the cooldown applies.
    pub until_ms: i64,
}

/// Per-rule usage consumed today, used to render "active constraints".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleUsage {
    pub rule_id: String,
    pub used_ms: i64,
    pub limit_ms: i64,
}

/// Everything the home dashboard needs on load for the current day.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
    pub date: String,
    pub focus_ms_so_far: i64,
    pub focus_blocks_so_far: i64,
    pub distraction_ms_so_far: i64,
    pub active_constraints: Vec<ActiveConstraint>,
    pub usage: Vec<RuleUsage>,
    pub upcoming_reminders: Vec<crate::db::models::Notification>,
    pub focus_mode: FocusModeStatus,
    pub cooldowns: Vec<CooldownStatus>,
    /// Undelivered enforcement commands awaiting a connected client.
    pub pending_interventions: i64,
}

/// Sum of duration grouped by ai_category over a range.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBucket {
    pub category: String,
    pub total_ms: i64,
    pub session_count: i64,
}

/// One block of a day's timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineBlock {
    pub id: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration_ms: i64,
    pub ai_category: Option<String>,
    pub hostname: String,
    pub url: String,
}

/// Chronological serialized day.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    pub date: String,
    pub blocks: Vec<TimelineBlock>,
}

/// A single compressed entry sent to the Intelligence Layer. Consecutive
/// sessions sharing hostname + category with continuous-ish coverage are
/// merged into one entry carrying `merged_count`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionForAI {
    pub id: String,
    pub client_id: String,
    pub url: String,
    pub hostname: String,
    pub pathname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    pub duration_ms: i64,
    pub ai_category: Option<String>,
    pub started_at: i64,
    pub ended_at: i64,
    pub matched_rules: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_rule_id: Option<String>,
    /// How many raw sessions collapsed into this entry.
    pub merged_count: i64,
    /// Category of the preceding entry in the batch (light local context).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preceded_by: Option<String>,
}