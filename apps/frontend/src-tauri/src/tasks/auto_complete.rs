//! Auto-completion of tasks from extension session signals.

use serde::Deserialize;
use tauri::Emitter;

use crate::db::models::{NewSession, Task};
use crate::state::AppState;

/// Parsed `completion_trigger` JSON. All present conditions must hold (AND).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionTrigger {
    #[serde(default)]
    pub rule_ids: Vec<String>,
    #[serde(default)]
    pub ai_category: Option<String>,
    #[serde(default)]
    pub min_duration_ms: Option<i64>,
}

/// True when the session satisfies every condition of the trigger.
fn does_session_match(session: &NewSession, trigger: &CompletionTrigger) -> bool {
    let matched_rules: Vec<&String> = session
        .matched_rules
        .iter()
        .filter(|r| !r.is_empty())
        .collect();

    if !trigger.rule_ids.is_empty() {
        let hit = trigger.rule_ids.iter().any(|id| {
            matched_rules.iter().any(|m| m.as_str() == id.as_str())
                || session.primary_rule_id.as_deref() == Some(id.as_str())
        });
        if !hit {
            return false;
        }
    }

    if let Some(category) = &trigger.ai_category {
        if !category.is_empty() && session.category.as_str() != category.as_str() {
            return false;
        }
    }

    if let Some(min) = trigger.min_duration_ms {
        if session.duration_ms < min {
            return false;
        }
    }

    true
}

/// Marks a single task completed and, when it carries a recurrence rule,
/// materialises the next instance. Emits `task-completed` to the frontend.
async fn complete_matching_task(state: &AppState, task: &Task) -> Result<(), String> {
    let updated =
        crate::db::tasks_queries::complete_with_recurrence(&state.db, &task.id).await?;
    tracing::info!(task_id = %task.id, title = %task.title, "auto-completed task");
    let _ = state.app.emit("task-completed", &serde_json::json!({ "id": updated.id }));
    crate::tasks::sync::broadcast_tasks_best_effort(state).await;
    Ok(())
}

/// Runs after a `session_end` is stored (before and/or after AI classification)
/// and marks every pending task whose `completion_trigger` matches the session.
/// Spawned tasks are idempotent — the second pass finds the task already
/// completed and skips it.
pub async fn check_auto_complete(state: &AppState, session: &NewSession) -> Result<(), String> {
    let tasks = crate::db::tasks_queries::pending_with_trigger(&state.db).await?;
    if tasks.is_empty() {
        return Ok(());
    }

    for task in tasks {
        let Some(raw) = &task.completion_trigger else {
            continue;
        };
        let Ok(trigger) = serde_json::from_str::<CompletionTrigger>(raw) else {
            tracing::debug!(task_id = %task.id, "malformed completion_trigger; skipping");
            continue;
        };
        if does_session_match(session, &trigger) {
            if let Err(err) = complete_matching_task(state, &task).await {
                tracing::warn!(task_id = %task.id, error = %err, "auto-completion failed");
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(category: &str, rules: Vec<&str>, duration_ms: i64) -> NewSession {
        NewSession {
            id: "s1".into(),
            client_id: "c1".into(),
            browser_type: "chrome".into(),
            url: "https://example.com".into(),
            hostname: "example.com".into(),
            pathname: "/".into(),
            meta: None,
            duration_ms,
            started_at: 0,
            ended_at: duration_ms,
            matched_rules: rules.into_iter().map(String::from).collect(),
            primary_rule_id: None,
            tab_id: 1,
            aggregated_from: Some(1),
            category: category.to_string(),
        }
    }

    fn trigger(json: &str) -> CompletionTrigger {
        serde_json::from_str(json).expect("trigger")
    }

    #[test]
    fn matches_on_category() {
        let session = session("deep_work", vec![], 1000);
        assert!(does_session_match(&session, &trigger(r#"{ "aiCategory": "deep_work" }"#)));
        assert!(!does_session_match(&session, &trigger(r#"{ "aiCategory": "social_media" }"#)));
    }

    #[test]
    fn matches_on_rule_ids() {
        let session = session("coding", vec!["r1", "r2"], 1000);
        assert!(does_session_match(&session, &trigger(r#"{ "ruleIds": ["r2", "r9"] }"#)));
        assert!(!does_session_match(&session, &trigger(r#"{ "ruleIds": ["r7"] }"#)));
    }

    #[test]
    fn matches_primary_rule_as_fallback() {
        let session = NewSession {
            primary_rule_id: Some("p1".into()),
            category: String::new(),
            ..session("", vec![], 1000)
        };
        assert!(does_session_match(&session, &trigger(r#"{ "ruleIds": ["p1"] }"#)));
    }

    #[test]
    fn requires_min_duration() {
        let session = session("reading", vec![], 500);
        assert!(!does_session_match(&session, &trigger(r#"{ "minDurationMs": 600 }"#)));
        assert!(does_session_match(&session, &trigger(r#"{ "minDurationMs": 500 }"#)));
    }

    #[test]
    fn ands_all_conditions() {
        let matching = session("deep_work", vec!["r1"], 2000);
        let trigger = trigger(
            r#"{ "ruleIds": ["r1"], "aiCategory": "deep_work", "minDurationMs": 1000 }"#,
        );
        assert!(does_session_match(&matching, &trigger));

        let short = session("deep_work", vec!["r1"], 500);
        assert!(!does_session_match(&short, &trigger));
    }
}