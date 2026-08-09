use serde::{Deserialize, Serialize};

/// One day of the User Behavior Graph: productive vs. distracting minutes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyBehavior {
    /// Local calendar day, `YYYY-MM-DD`.
    pub date: String,
    /// Cumulative productive minutes for the day (2 dp).
    pub productive_minutes: f64,
    /// Cumulative distracting minutes for the day (2 dp).
    pub distracting_minutes: f64,
}

/// A single unwholesome activity bucket surfaced on the dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NegativeWorkItem {
    /// Canonical `ai_category` id (e.g. `dopamine_shorts`).
    pub category: String,
    /// Total time across the window, in minutes (2 dp).
    pub total_minutes: f64,
    /// Number of sessions falling in the category.
    pub session_count: i32,
    /// Human-readable label (e.g. `YouTube Shorts`).
    pub description: String,
}

/// Buddha-themed correction steps for a negative category.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrectionAdvice {
    pub category: String,
    /// e.g. "Escaping the Infinite Scroll".
    pub title: String,
    /// Ordered, actionable steps with breathing/meditation cues.
    pub steps: Vec<String>,
}

/// Human-readable labels for the negative category ids surfaced on the
/// dashboard. Unlisted categories fall back to a readable version of the id.
pub fn negative_work_description(category: &str) -> String {
    match category {
        "dopamine_shorts" => "YouTube Shorts".to_string(),
        "social_media" => "Social Media".to_string(),
        "gambling" => "Gambling".to_string(),
        "adult_content" => "Adult Content".to_string(),
        "gaming" => "Gaming".to_string(),
        "streaming" => "Streaming".to_string(),
        "entertainment" => "Entertainment".to_string(),
        "shopping" => "Online Shopping".to_string(),
        "browsing" => "Mindless Browsing".to_string(),
        "distracting" => "Distracting Activity".to_string(),
        other => other.replace('_', " "),
    }
}
