//! Pure window-session state machine (no I/O, fully unit-testable).
//!
//! Conceptually equivalent to the browser extension's tracker:
//!
//! - A session begins when a previously unknown window becomes focused.
//! - A session ends when focus moves to a *different* window identity
//!   (`process_name::title`), when the desktop loses focus for more than
//!   `focus_lost_ms`, or when explicitly flushed (tracking paused/app exit).
//! - Switches lasting under `min_session_ms` are debounced: the short-lived
//!   window is ignored and its interval folds into the surrounding session,
//!   mirroring the extension's `SWITCH_DEBOUNCE_MS` behaviour.

use crate::desktop_tracker::window::TrackedWindow;

/// Sessions shorter than this are never emitted; their interval is absorbed
/// into the previous session (debounce).
pub const MIN_SESSION_MS: i64 = 2_000;

/// A window being absent for longer than this ends the session with a
/// `focus_lost`.
pub const FOCUS_LOST_MS: i64 = 120_000;

/// Deterministic identity key for a window: `process::title`.
fn identity(window: &TrackedWindow) -> String {
    format!("{}::{}", window.process_name, window.title)
}

/// The window that was focused when a session ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EndedSession {
    pub process_name: String,
    pub title: String,
    pub started_at: i64,
    pub ended_at: i64,
}

impl EndedSession {
    pub fn duration_ms(&self) -> i64 {
        self.ended_at.saturating_sub(self.started_at)
    }
}

/// Outcome of a single tick.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct TickOutcome {
    /// A session ended on this tick (if any).
    pub ended: Option<EndedSession>,
    /// The previous session was ended because focus was lost for too long.
    pub focus_lost: bool,
    /// A new trackable window became focused right after a focus loss.
    pub focus_gained: bool,
}

#[derive(Debug, Clone)]
struct ActiveSession {
    process_name: String,
    title: String,
    identity: String,
    started_at: i64,
    last_seen: i64,
}

/// Window focus tracker. `tick` is invoked once per poll interval.
#[derive(Debug)]
pub struct SessionTracker {
    current: Option<ActiveSession>,
    /// Set when the last emitted event was a `focus_lost`, so the next session
    /// start can announce a paired `focus_gained`.
    focus_was_lost: bool,
    pub min_session_ms: i64,
    pub focus_lost_ms: i64,
}

impl SessionTracker {
    pub fn new() -> Self {
        Self {
            current: None,
            focus_was_lost: false,
            min_session_ms: MIN_SESSION_MS,
            focus_lost_ms: FOCUS_LOST_MS,
        }
    }

    /// Tune thresholds (used by tests to compress simulated time).
    #[allow(dead_code)]
    pub fn with_thresholds(min_session_ms: i64, focus_lost_ms: i64) -> Self {
        Self {
            current: None,
            focus_was_lost: false,
            min_session_ms,
            focus_lost_ms,
        }
    }

    /// Whether a window is currently being tracked.
    #[allow(dead_code)]
    pub fn active(&self) -> bool {
        self.current.is_some()
    }

    /// Advances the machine one poll tick. `None` means "no focusable window".
    pub fn tick(&mut self, window: Option<&TrackedWindow>, now: i64) -> TickOutcome {
        match window {
            Some(w) => self.tick_window(w, now),
            None => self.tick_no_window(now),
        }
    }

    /// Ends the current session immediately at `now`, regardless of duration,
    /// and returns it. Used when tracking is paused or the app exits. Does not
    /// emit focus telemetry.
    pub fn flush(&mut self, now: i64) -> Option<EndedSession> {
        let current = self.current.take()?;
        Some(EndedSession {
            process_name: current.process_name,
            title: current.title,
            started_at: current.started_at,
            ended_at: now,
        })
    }

    fn tick_window(&mut self, w: &TrackedWindow, now: i64) -> TickOutcome {
        let id = identity(w);
        let mut out = TickOutcome::default();

        match self.current.as_mut() {
            None => {
                if self.focus_was_lost {
                    out.focus_gained = true;
                    self.focus_was_lost = false;
                }
                self.current = Some(ActiveSession {
                    process_name: w.process_name.clone(),
                    title: w.title.clone(),
                    identity: id,
                    started_at: now,
                    last_seen: now,
                });
            }
            Some(cur) if cur.identity != id => {
                if now - cur.started_at >= self.min_session_ms {
                    let ended = EndedSession {
                        process_name: cur.process_name.clone(),
                        title: cur.title.clone(),
                        started_at: cur.started_at,
                        ended_at: now,
                    };
                    out.ended = Some(ended);
                    self.current = Some(ActiveSession {
                        process_name: w.process_name.clone(),
                        title: w.title.clone(),
                        identity: id,
                        started_at: now,
                        last_seen: now,
                    });
                } else {
                    // Too short to stand alone: keep the previous session alive
                    // and fold this interval into it (debounce).
                    cur.last_seen = now;
                }
            }
            Some(cur) => {
                cur.last_seen = now;
            }
        }

        out
    }

    fn tick_no_window(&mut self, now: i64) -> TickOutcome {
        let mut out = TickOutcome::default();
        if let Some(cur) = self.current.as_ref() {
            if now - cur.last_seen >= self.focus_lost_ms {
                out.ended = Some(EndedSession {
                    process_name: cur.process_name.clone(),
                    title: cur.title.clone(),
                    started_at: cur.started_at,
                    ended_at: cur.last_seen,
                });
                out.focus_lost = true;
                self.focus_was_lost = true;
                self.current = None;
            }
        }
        out
    }
}

impl Default for SessionTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(process: &str, title: &str) -> TrackedWindow {
        TrackedWindow {
            process_name: process.to_string(),
            title: title.to_string(),
            process_id: 0,
        }
    }

    #[test]
    fn starts_and_ends_on_switch() {
        let mut t = SessionTracker::new();
        let a = win("Code", "main.rs");
        let b = win("Code", "other.rs");

        assert!(!t.active());
        assert_eq!(t.tick(Some(&a), 0), TickOutcome::default());
        assert!(t.active());

        // Same window keeps accruing.
        assert_eq!(t.tick(Some(&a), 1_000), TickOutcome::default());
        assert!(t.active());

        // 10 s in the same window: switching to B ends [0, 10_000].
        let out = t.tick(Some(&b), 10_000);
        let ended = out.ended.expect("session ended");
        assert_eq!(ended.process_name, "Code");
        assert_eq!(ended.title, "main.rs");
        assert_eq!(ended.started_at, 0);
        assert_eq!(ended.ended_at, 10_000);
        assert_eq!(ended.duration_ms(), 10_000);
        assert!(!out.focus_lost);
        assert!(!out.focus_gained);
    }

    #[test]
    fn debounces_short_switches() {
        let mut t = SessionTracker::with_thresholds(2_000, 120_000);
        let a = win("Code", "main.rs");
        let b = win("Slack", "team");

        t.tick(Some(&a), 0);
        // B appears 1 s later — below the 2 s threshold, so the session keeps A.
        let out = t.tick(Some(&b), 1_000);
        assert!(out.ended.is_none());
        assert!(t.active());

        // B is still around 4 s in: now it's a real switch.
        let out = t.tick(Some(&b), 5_000);
        let ended = out.ended.expect("switched");
        assert_eq!(ended.title, "main.rs");
        // It only counts ~5 s (the blip was folded into A).
        assert_eq!(ended.duration_ms(), 5_000);
    }

    #[test]
    fn focus_loss_ends_session_after_timeout() {
        let mut t = SessionTracker::with_thresholds(2_000, 2_000);
        let a = win("Terminal", "bash");
        t.tick(Some(&a), 0);

        // Still within the window.
        assert!(t.tick(None, 1_000).ended.is_none());
        assert!(t.active());

        // Past the 2 s timeout: session ends at last_seen, focus lost emitted.
        let out = t.tick(None, 3_000);
        let ended = out.ended.expect("ended on focus loss");
        assert_eq!(ended.ended_at, 0); // only the visible interval is counted
        assert!(out.focus_lost);
        assert!(!t.active());

        // A new window after the loss announces focus gained.
        let out = t.tick(Some(&win("Code", "main.rs")), 4_000);
        assert!(out.focus_gained);
        assert!(out.ended.is_none());
        assert!(t.active());
    }

    #[test]
    fn flush_returns_in_progress_session() {
        let mut t = SessionTracker::new();
        t.tick(Some(&win("Code", "main.rs")), 1_000);
        let ended = t.flush(9_000).expect("flushed");
        assert_eq!(ended.started_at, 1_000);
        assert_eq!(ended.ended_at, 9_000);
        assert!(!t.active());
        assert!(t.flush(9_000).is_none());
    }

    #[test]
    fn regained_same_window_continues() {
        let mut t = SessionTracker::new();
        let a = win("Code", "main.rs");
        t.tick(Some(&a), 0);
        t.tick(Some(&a), 1_000);
        // Same identity, no duration threshold could apply.
        assert!(t.tick(Some(&a), 2_000).ended.is_none());
        assert!(t.active());
    }
}