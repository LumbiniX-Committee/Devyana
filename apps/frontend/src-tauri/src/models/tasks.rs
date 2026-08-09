use serde::{Deserialize, Serialize};

/// Task shape as the browser extension expects it (`{ id, title, url? }`),
/// pushed to clients through the `update_tasks` desktop command so the
/// "What did you intend to do?" intervention lists the user's real tasks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTask {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

impl ExtensionTask {
    pub fn from_task(task: &crate::db::models::Task) -> Self {
        let url = task
            .description
            .as_deref()
            .filter(|d| d.starts_with("http://") || d.starts_with("https://"))
            .map(String::from);
        Self {
            id: task.id.clone(),
            title: task.title.clone(),
            url,
        }
    }
}

/// One day inside the productivity contribution grid.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayProductivity {
    /// Local calendar day, `YYYY-MM-DD`.
    pub date: String,
    /// Normalised productivity score, 0.0 – 1.0 (deterministic, local).
    pub score: f64,
    /// Hours spent in productive categories that day.
    pub focus_hours: f64,
    /// Hours spent in distracting categories that day.
    pub distraction_hours: f64,
    pub tasks_completed: i32,
    pub pomodoro_sessions: i32,
}

/// An AI-suggested task shown in the `TaskPanel` picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSuggestion {
    pub title: String,
    pub description: String,
    pub reason: String,
}

/// Offline fallbacks returned when the Intelligence Layer is unreachable or
/// not configured yet.
pub fn default_task_suggestions() -> Vec<TaskSuggestion> {
    vec![
        TaskSuggestion {
            title: "Read for 30 minutes".into(),
            description: "Pick a book or article that supports a current goal.".into(),
            reason: "A short reading block reliably raises your focus score.".into(),
        },
        TaskSuggestion {
            title: "Review today's goals".into(),
            description: "Re-scan the goals you set and plan the next hour.".into(),
            reason: "Reconnecting with your goals keeps the day on track.".into(),
        },
        TaskSuggestion {
            title: "Deep work block".into(),
            description: "One uninterrupted block on your most important task.".into(),
            reason: "Your behavior graph rewards focused, single-tab sessions.".into(),
        },
        TaskSuggestion {
            title: "Plan tomorrow".into(),
            description: "List tomorrow's top outcomes before you close for the day.".into(),
            reason: "A clear plan makes tomorrow's start effortless.".into(),
        },
    ]
}
