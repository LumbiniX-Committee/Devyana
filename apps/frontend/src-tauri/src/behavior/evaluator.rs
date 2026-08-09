use std::collections::{HashMap, HashSet};

use chrono::Datelike;
use regex::Regex;
use tokio_tungstenite::tungstenite::Message;

use crate::behavior::constraints::{ConstraintDefinition, DesktopCommand, Rule};
use crate::db::models::NewSession;
use crate::state::AppState;

/// Converts a DNS suffix into a lowercase host. Mirrors the extension's
/// `normalizeHost` (strips a leading `www.`).
fn sanitize_host(hostname: &str) -> String {
    hostname.trim_start_matches("www.").to_lowercase()
}

#[derive(Debug)]
enum FieldMatcher {
    ExactHost(String),
    PathPrefix(String),
    Contains(String),
    Regex(Regex),
    Never,
}

impl FieldMatcher {
    fn matches(&self, value: &str) -> bool {
        match self {
            FieldMatcher::ExactHost(host) => sanitize_host(host).eq(&sanitize_host(value)),
            FieldMatcher::PathPrefix(prefix) => {
                let normalized = if prefix.ends_with('/') {
                    prefix.clone()
                } else {
                    format!("{prefix}/")
                };
                value == prefix.as_str() || value.starts_with(&normalized)
            }
            FieldMatcher::Contains(needle) => value.contains(needle),
            FieldMatcher::Regex(re) => re.is_match(value),
            FieldMatcher::Never => false,
        }
    }
}

/// Compiles one field pattern following the extensions's compiler semantics
/// (regex form `/.../flags`, glob form with `*` / `**` / `?`, else plain).
fn compile_matcher(pattern: &str, mode: &str) -> FieldMatcher {
    let trimmed = pattern.trim();

    // /regex/flags  (flags gimsuy -> only `i` is honored by Rust regex)
    if let Some(rest) = trimmed.strip_prefix('/') {
        if let Some(idx) = rest.rfind('/') {
            let inner = &rest[..idx];
            let flags = &rest[idx + 1..];
            let mut src = String::new();
            if flags.contains('i') {
                src.push_str("(?i)");
            }
            src.push_str(inner);
            if let Ok(re) = Regex::new(&src) {
                return FieldMatcher::Regex(re);
            }
        }
    }

    // Glob: `*.example.com` (host-extension wildcard) or `*` / `?` patterns.
    if trimmed.contains('*') || trimmed.contains('?') {
        if let Ok(re) = Regex::new(&glob_to_regex(trimmed)) {
            return FieldMatcher::Regex(re);
        }
        return FieldMatcher::Never;
    }

    match mode {
        "hostname" => FieldMatcher::ExactHost(sanitize_host(trimmed)),
        "pathname" => FieldMatcher::PathPrefix(trimmed.to_string()),
        _ => FieldMatcher::Contains(trimmed.to_string()),
    }
}

fn glob_to_regex(glob: &str) -> String {
    if let Some(ext) = glob.strip_prefix("*.") {
        return format!("^(.*\\.)?{}", regex::escape(ext));
    }

    let mut out = String::from("^");
    let chars: Vec<char> = glob.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '*' => {
                if i + 1 < chars.len() && chars[i + 1] == '*' {
                    out.push_str(".*");
                    i += 1;
                } else {
                    out.push_str("[^/]*");
                }
            }
            '?' => out.push_str("[^/]"),
            c => out.push_str(&regex::escape(&c.to_string())),
        }
        i += 1;
    }
    out.push('$');
    out
}

#[derive(Debug, Default)]
struct Condition {
    hostname: Option<FieldMatcher>,
    pathname: Option<FieldMatcher>,
    search: Option<FieldMatcher>,
}

impl Condition {
    fn matches(&self, host: &str, path: &str, search: &str) -> bool {
        self.hostname.as_ref().map_or(true, |m| m.matches(host))
            && self.pathname.as_ref().map_or(true, |m| m.matches(path))
            && self.search.as_ref().map_or(true, |m| m.matches(search))
    }
}

fn condition_from_spec(spec: &serde_json::Value) -> Condition {
    Condition {
        hostname: spec
            .get("hostname")
            .and_then(|v| v.as_str())
            .map(|p| compile_matcher(p, "hostname")),
        pathname: spec
            .get("pathname")
            .and_then(|v| v.as_str())
            .map(|p| compile_matcher(p, "pathname")),
        search: spec
            .get("search")
            .and_then(|v| v.as_str())
            .map(|p| compile_matcher(p, "search")),
    }
}

/// Expands a rule's `match` spec (including `ref:` indirection) into a flat
/// list of concrete URL conditions.
fn expand_spec(
    rule: &Rule,
    index: &HashMap<String, Rule>,
    visited: &mut HashSet<String>,
    out: &mut Vec<Condition>,
) {
    let specs: Vec<&serde_json::Value> = match &rule.match_spec {
        serde_json::Value::Array(arr) => arr.iter().collect(),
        other => vec![other],
    };

    for spec in specs {
        if let Some(ref_id) = spec.get("ref").and_then(|v| v.as_str()) {
            if visited.contains(ref_id) {
                continue;
            }
            if let Some(referenced) = index.get(ref_id) {
                visited.insert(ref_id.to_string());
                expand_spec(referenced, index, visited, out);
            }
        } else {
            out.push(condition_from_spec(spec));
        }
    }
}

fn rule_matches(
    rule: &Rule,
    index: &HashMap<String, Rule>,
    host: &str,
    path: &str,
    search: &str,
) -> bool {
    let mut conditions = Vec::new();
    expand_spec(rule, index, &mut HashSet::new(), &mut conditions);
    conditions
        .iter()
        .any(|condition| condition.matches(host, path, search))
}

/// Start (epoch ms) of the window described by `scope` relative to `now_ms`.
fn window_start_ms(scope: &str, now_ms: i64) -> i64 {
    let now = chrono::DateTime::from_timestamp_millis(now_ms)
        .map(|ts| ts.with_timezone(&chrono::Local))
        .unwrap_or_else(chrono::Local::now);

    match scope {
        "daily" => {
            let midnight = now.date_naive().and_hms_opt(0, 0, 0).expect("valid hms");
            midnight
                .and_local_timezone(chrono::Local)
                .earliest()
                .map(|dt| dt.timestamp_millis())
                .unwrap_or(0)
        }
        "weekly" => {
            let days_since_monday = now.weekday().num_days_from_monday();
            let week_start = now.date_naive() - chrono::Days::new(days_since_monday as u64);
            week_start
                .and_hms_opt(0, 0, 0)
                .expect("valid hms")
                .and_local_timezone(chrono::Local)
                .earliest()
                .map(|dt| dt.timestamp_millis())
                .unwrap_or(0)
        }
        _ => 0,
    }
}

fn severity(command: &DesktopCommand) -> u8 {
    match command {
        DesktopCommand::HardBlock { .. } => 5,
        DesktopCommand::PauseMedia { .. } => 4,
        DesktopCommand::SoftBlock { .. } => 3,
        DesktopCommand::ShowWarning { .. } => 2,
        DesktopCommand::ResumeMedia { .. } => 1,
        DesktopCommand::Unblock { .. } => 1,
        DesktopCommand::UpdateRules { .. } => 0,
        DesktopCommand::UpdateTasks { .. } => 0,
    }
}

/// Core evaluation: which active constraints does `session` violate?
pub async fn evaluate(
    state: &AppState,
    session: &NewSession,
) -> Result<Option<DesktopCommand>, String> {
    let constraint_rows = crate::db::queries::list_active_constraints(&state.db).await?;

    let mut index: HashMap<String, Rule> = HashMap::new();
    let mut definitions = Vec::new();

    for row in constraint_rows {
        if let Ok(def) = ConstraintDefinition::parse(&row.rule_definition) {
            index
                .entry(def.rule.id.clone())
                .or_insert_with(|| def.rule.clone());
            definitions.push(def);
        } else if let Ok(rule) = serde_json::from_str::<Rule>(&row.rule_definition) {
            index.entry(rule.id.clone()).or_insert(rule);
        }
    }

    let mut best: Option<DesktopCommand> = None;

    for def in definitions {
        if def.limit_ms <= 0 {
            continue;
        }
        if !rule_matches(&def.rule, &index, &session.hostname, &session.pathname, "") {
            continue;
        }

        let window_start = window_start_ms(&def.scope, session.ended_at);
        let used =
            crate::db::queries::total_time_for_rule_since(&state.db, &def.rule.id, window_start)
                .await?;
        let total = used.saturating_add(session.duration_ms);

        if total >= def.limit_ms {
            let command = DesktopCommand::from_action(
                &def.action,
                session.tab_id,
                def.message.clone(),
                def.grace_period_ms,
            );
            if best
                .as_ref()
                .map(|current| severity(&command) > severity(current))
                .unwrap_or(true)
            {
                best = Some(command);
            }
        }
    }

    Ok(best)
}

/// Evaluates a session against active constraints and dispatches the resulting
/// enforcement command: delivered immediately over the WebSocket if the client
/// is online, otherwise queued in `pending_commands`.
pub async fn evaluate_for_session(state: &AppState, session: &NewSession) -> Result<(), String> {
    let Some(command) = evaluate(state, session).await? else {
        return Ok(());
    };

    let payload = serde_json::to_string(&command).map_err(|e| e.to_string())?;
    let queue_type = command.type_name().to_string();

    match state
        .registry
        .send(&session.client_id, Message::Text(payload.clone().into()))
        .await
    {
        Ok(()) => tracing::info!(
            client_id = %session.client_id,
            command = command.type_name(),
            "enforcement command sent live"
        ),
        Err(()) => {
            crate::db::queries::push_pending_command(
                &state.db,
                &session.client_id,
                &queue_type,
                &payload,
            )
            .await?;
            tracing::info!(
                client_id = %session.client_id,
                command = command.type_name(),
                "client offline; enforcement command queued"
            );
        }
    }

    Ok(())
}
