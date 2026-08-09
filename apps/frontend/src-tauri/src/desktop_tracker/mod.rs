//! Desktop application window tracker.
//!
//! While the Tauri app is open, a daemon task polls the focused window once per
//! second, accumulates usage per `(process_name, title)` identity and, on every
//! switch or focus loss, emits a `session_end` event that flows through the
//! exact same pipeline as the browser extension's events (database insert ->
//! constraint evaluation -> auto-completion -> AI classification).
//!
//! Event schema (mirrors `SessionEndEvent` from `@vinaya/behavior-core`):
//!   clientId: "desktop-native", browserType: "desktop",
//!   ruleIds: [], primaryRuleId: "desktop", category: "desktop_app",
//!   url: "", hostname: "app://<process_name>", pathname: <window_title>,
//!   tabId: 0.

pub mod tracker;
pub mod window;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::Emitter;

use crate::db::models::NewSession;
use crate::db::queries;
use crate::state::AppState;

use self::tracker::{EndedSession, SessionTracker, TickOutcome};
use self::window::{SystemWindowProvider, WindowProvider};

/// Client id recorded for every desktop-native session.
pub const CLIENT_ID: &str = "desktop-native";
/// `browserType` variant for native/app windows.
pub const BROWSER_TYPE: &str = "desktop";
/// Generic primary rule id; desktop windows are not URL-rule matched.
pub const PRIMARY_RULE_ID: &str = "desktop";
/// Category placeholder until the Intelligence Layer classifies the session.
pub const PLACEHOLDER_CATEGORY: &str = "desktop_app";
/// Scheme prefix used to mint a pseudo-host from the process name.
pub const HOST_PREFIX: &str = "app://";

/// How often the active window is polled.
const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Tauri event emitted whenever desktop tracking is enabled/disabled.
pub const STATUS_EVENT: &str = "desktop_tracking_status";

/// Shared control surface for the polling loop. The loop reads `enabled` every
/// tick; toggling it pauses/resumes without restarting the task.
#[derive(Debug)]
pub struct DesktopTrackingControl {
    enabled: AtomicBool,
}

impl Default for DesktopTrackingControl {
    fn default() -> Self {
        Self::new()
    }
}

impl DesktopTrackingControl {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(true),
        }
    }

    pub fn set(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }
}

/// Starts the tracking daemon. Reads the persisted setting, publishes the
/// current status to the frontend and spawns the polling task.
pub fn start(state: AppState) {
    let enabled = state.settings().desktop_tracking_enabled;
    state.desktop_tracking.set(enabled);
    emit_status(&state, enabled);
    tauri::async_runtime::spawn(run_loop(state));
}

/// Persists the desired tracking state and notifies listeners.
pub fn set_enabled(state: &AppState, enabled: bool) -> Result<(), String> {
    state.desktop_tracking.set(enabled);
    let mut settings = state.settings();
    settings.desktop_tracking_enabled = enabled;
    state.set_settings(settings);
    state.save_settings()?;
    emit_status(state, enabled);
    Ok(())
}

fn emit_status(state: &AppState, enabled: bool) {
    let _ = state.app.emit(STATUS_EVENT, enabled);
}

/// Polling loop: runs until the app exits.
async fn run_loop(state: AppState) {
    let provider: Arc<dyn WindowProvider> = Arc::new(SystemWindowProvider);
    let mut tracker = SessionTracker::new();
    let mut interval = tokio::time::interval(POLL_INTERVAL);
    // Do not burst after a slow tick (e.g. laptop resume).
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        interval.tick().await;
        let now = now_ms();

        if !state.desktop_tracking.enabled() {
            // Paused: flush whatever was in flight so no time is lost.
            if let Some(ended) = tracker.flush(now) {
                emit_session(&state, ended).await;
            }
            continue;
        }

        let window = provider.active_window();
        let outcome = tracker.tick(window.as_ref(), now);
        handle_outcome(&state, outcome).await;
    }
}

async fn handle_outcome(state: &AppState, outcome: TickOutcome) {
    if let Some(ended) = outcome.ended {
        emit_session(state, ended).await;
    }
    if outcome.focus_lost {
        let _ = queries::insert_focus_log(&state.db, CLIENT_ID, "lost", now_ms()).await;
    }
    if outcome.focus_gained {
        let _ = queries::insert_focus_log(&state.db, CLIENT_ID, "gained", now_ms()).await;
    }
}

/// Builds a `NewSession` matching the shared `session_end` schema for an ended
/// native-app session. Used by the daemon and by integration tests so the test
/// exercises the exact payload the tracker emits.
pub fn desktop_session(ended: EndedSession) -> NewSession {
    let duration_ms = ended.duration_ms();
    NewSession {
        id: uuid::Uuid::new_v4().to_string(),
        client_id: CLIENT_ID.to_string(),
        browser_type: BROWSER_TYPE.to_string(),
        url: String::new(),
        hostname: format!("{HOST_PREFIX}{}", ended.process_name),
        pathname: ended.title,
        meta: None,
        duration_ms,
        started_at: ended.started_at,
        ended_at: ended.ended_at,
        matched_rules: Vec::new(),
        primary_rule_id: Some(PRIMARY_RULE_ID.to_string()),
        tab_id: 0,
        aggregated_from: None,
        category: PLACEHOLDER_CATEGORY.to_string(),
    }
}

/// Feeds an ended desktop session through the same pipeline the WebSocket
/// handler uses.
async fn emit_session(state: &AppState, ended: EndedSession) {
    let session = desktop_session(ended);
    if session.duration_ms <= 0 {
        return;
    }

    if let Err(err) = crate::event_processor::handle_session_end(state, session).await {
        tracing::error!(error = %err, "desktop session_end processing failed");
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}