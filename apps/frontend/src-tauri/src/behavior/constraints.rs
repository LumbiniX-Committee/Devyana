use serde::{Deserialize, Serialize};

/// Mirrors the `Rule` type from `packages/behavior-core` (selectors only).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    #[serde(rename = "match")]
    pub match_spec: serde_json::Value,
    #[serde(default)]
    pub meta: Vec<String>,
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub behavior: Option<serde_json::Value>,
}

/// Enforcement metadata attached to a constraint (persisted together with the
/// rule in `constraints.rule_definition`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintDefinition {
    pub rule: Rule,
    #[serde(default)]
    pub limit_ms: i64,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default = "default_action")]
    pub action: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub grace_period_ms: Option<i64>,
}

fn default_scope() -> String {
    "daily".to_string()
}

fn default_action() -> String {
    "soft_block".to_string()
}

impl ConstraintDefinition {
    pub fn parse(raw: &str) -> Result<Self, String> {
        serde_json::from_str(raw).map_err(|e| format!("invalid constraint definition: {e}"))
    }
}

/// `DesktopCommand` union, serialized exactly as the extension expects.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum DesktopCommand {
    #[serde(rename_all = "camelCase")]
    SoftBlock { tab_id: i64 },
    #[serde(rename_all = "camelCase")]
    HardBlock { tab_id: i64 },
    #[serde(rename_all = "camelCase")]
    Unblock { tab_id: i64 },
    #[serde(rename_all = "camelCase")]
    PauseMedia { tab_id: i64 },
    #[serde(rename_all = "camelCase")]
    ResumeMedia { tab_id: i64 },
    #[serde(rename_all = "camelCase")]
    ShowWarning {
        tab_id: i64,
        message: String,
        grace_period_ms: i64,
    },
    #[serde(rename_all = "camelCase")]
    UpdateRules { rules: Vec<Rule> },
    #[serde(rename_all = "camelCase")]
    UpdateTasks {
        tasks: Vec<crate::models::tasks::ExtensionTask>,
    },
}

impl DesktopCommand {
    pub fn type_name(&self) -> &'static str {
        match self {
            DesktopCommand::SoftBlock { .. } => "soft_block",
            DesktopCommand::HardBlock { .. } => "hard_block",
            DesktopCommand::Unblock { .. } => "unblock",
            DesktopCommand::PauseMedia { .. } => "pause_media",
            DesktopCommand::ResumeMedia { .. } => "resume_media",
            DesktopCommand::ShowWarning { .. } => "show_warning",
            DesktopCommand::UpdateRules { .. } => "update_rules",
            DesktopCommand::UpdateTasks { .. } => "update_tasks",
        }
    }

    /// Builds a command from a constraint action string.
    pub fn from_action(
        action: &str,
        tab_id: i64,
        message: Option<String>,
        grace_period_ms: Option<i64>,
    ) -> DesktopCommand {
        match action {
            "hard_block" => DesktopCommand::HardBlock { tab_id },
            "pause_media" => DesktopCommand::PauseMedia { tab_id },
            "show_warning" => DesktopCommand::ShowWarning {
                tab_id,
                message: message.unwrap_or_else(|| "You've reached your limit".to_string()),
                grace_period_ms: grace_period_ms.unwrap_or(0),
            },
            "unblock" => DesktopCommand::Unblock { tab_id },
            _ => DesktopCommand::SoftBlock { tab_id },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_desktop_command() {
        let cmd = DesktopCommand::ShowWarning {
            tab_id: 12,
            message: "slow down".into(),
            grace_period_ms: 3000,
        };
        let json = serde_json::to_string(&cmd).expect("serializes");
        assert_eq!(
            json,
            r#"{"command":"show_warning","tabId":12,"message":"slow down","gracePeriodMs":3000}"#
        );
    }

    #[test]
    fn serializes_update_tasks_command() {
        use crate::models::tasks::ExtensionTask;
        let cmd = DesktopCommand::UpdateTasks {
            tasks: vec![ExtensionTask {
                id: "t1".into(),
                title: "Read".into(),
                url: Some("https://example.com".into()),
            }],
        };
        let json = serde_json::to_string(&cmd).expect("serializes");
        assert_eq!(
            json,
            r#"{"command":"update_tasks","tasks":[{"id":"t1","title":"Read","url":"https://example.com"}]}"#
        );
    }
}
