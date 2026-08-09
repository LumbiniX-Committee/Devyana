//! End-to-end test of the desktop-tracking persistence pipeline.
//!
//! Drives the real tracker state machine against a fresh SQLite database with
//! all migrations applied, persisting sessions through the exact writes the
//! running daemon performs (`desktop_tracker::handle_outcome` emits ended
//! sessions via `desktop_session` + `insert_session`, and records focus
//! telemetry in `focus_log`).
//!
//! It stops short of `event_processor::handle_session_end` because that entry
//! point needs an `AppState` bound to a live Wry `AppHandle`, which a headless
//! test cannot construct. The module below stands in for the extension handler
//! and asserts the contract the rest of the system relies on: native sessions
//! appear as `client_id = "desktop-native"` rows whose hostname uses the
//! `app://` scheme.

use std::path::PathBuf;

use sqlx::SqlitePool;

use crate::db::pool;
use crate::db::queries;
use crate::desktop_tracker::desktop_session;
use crate::desktop_tracker::tracker::{SessionTracker, TickOutcome};
use crate::desktop_tracker::window::{sanitize_process_name, TrackedWindow};
use crate::desktop_tracker::{BROWSER_TYPE, CLIENT_ID, HOST_PREFIX, PRIMARY_RULE_ID};

/// Mirrors `desktop_tracker::handle_outcome`: persist an ended session and any
/// focus telemetry, exactly as the running daemon does.
async fn persist_outcome(db: &SqlitePool, outcome: TickOutcome) {
    if let Some(ended) = outcome.ended {
        let session = desktop_session(ended);
        assert!(session.duration_ms > 0, "daemon skips non-positive durations");
        queries::insert_session(db, &session)
            .await
            .expect("insert session");
    }
    if outcome.focus_lost {
        queries::insert_focus_log(db, CLIENT_ID, "lost", 0)
            .await
            .expect("insert focus_lost");
    }
    if outcome.focus_gained {
        queries::insert_focus_log(db, CLIENT_ID, "gained", 0)
            .await
            .expect("insert focus_gained");
    }
}

fn temp_db_path() -> PathBuf {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    std::env::temp_dir()
        .join(format!("frocus_it_{}_{}", std::process::id(), n))
        .join("test.db")
}

fn tracked_window(process_name: &str, title: &str) -> TrackedWindow {
    TrackedWindow {
        process_name: sanitize_process_name(process_name),
        title: title.to_string(),
        process_id: 0,
    }
}

#[tokio::test]
async fn native_sessions_land_in_db_as_desktop_native() {
    let db_path = temp_db_path();
    std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();
    let db = pool::create_pool(&db_path).await.expect("create pool");
    eprintln!("temp db: {}", db_path.display());

    // Script the focus sequence of a typical day, with default thresholds
    // (2 s minimum session, 120 s focus-loss timeout).
    let mut tracker = SessionTracker::new();

    let code = tracked_window("Code.exe", "src/main.rs - Visual Studio Code");
    let slack = tracked_window("Slack.exe", "acme-team");

    // 0 – 10 s focused in Code, then a switch to Slack ends it.
    tracker.tick(Some(&code), 0);
    tracker.tick(Some(&code), 5_000);
    let outcome = tracker.tick(Some(&slack), 10_000);
    assert!(outcome.ended.is_some(), "switching windows must end the session");
    persist_outcome(&db, outcome).await;

    // Slack for a few seconds, then the desktop loses focus for 2+ minutes.
    tracker.tick(Some(&slack), 15_000);
    let outcome = tracker.tick(None, 20_000);
    assert!(outcome.ended.is_none(), "still within the focus-loss window");
    let outcome = tracker.tick(None, 20_000 + 121_000);
    assert!(outcome.focus_lost, "long absence must mark focus lost");
    persist_outcome(&db, outcome).await;

    // Focus regained on a terminal app, which then exits.
    let terminal = tracked_window("WindowsTerminal.exe", "bash");
    let outcome = tracker.tick(Some(&terminal), 21_000);
    assert!(outcome.focus_gained, "first window after a focus loss");
    persist_outcome(&db, outcome).await;

    tracker.tick(Some(&terminal), 26_000);
    // App closed: the daemon flushes the in-flight session.
    let ended = tracker.flush(30_000).expect("flush on exit");
    let session = desktop_session(ended);
    queries::insert_session(&db, &session)
        .await
        .expect("insert flushed session");

    // -- Assertions -------------------------------------------------------
    let rows = queries::list_sessions(&db, 10, 0).await.expect("list sessions");
    assert_eq!(rows.len(), 3, "expected Code, Slack, WindowsTerminal sessions");

    // Every row must declare its native origin so the frontend and analytics
    // can keep desktop usage distinct from browser tabs.
    for row in &rows {
        assert_eq!(row.client_id, CLIENT_ID);
        assert_eq!(row.browser_type, BROWSER_TYPE);
        assert!(row.hostname.starts_with(HOST_PREFIX));
        assert_eq!(row.matched_rules, "[]");
        assert_eq!(row.primary_rule_id.as_deref(), Some(PRIMARY_RULE_ID));
        assert_eq!(row.tab_id, 0);
    }

    // The Code session's exact identity survives end to end.
    let code_sessions: Vec<_> = rows.iter().filter(|r| r.hostname == "app://Code").collect();
    assert_eq!(code_sessions.len(), 1);
    assert_eq!(code_sessions[0].pathname, "src/main.rs - Visual Studio Code");
    assert_eq!(code_sessions[0].duration_ms, 10_000);
    assert_eq!(code_sessions[0].started_at, 0);

    // Slack sat visible from 10 s until its last-seen time before the loss.
    let slack_sessions: Vec<_> = rows.iter().filter(|r| r.hostname == "app://Slack").collect();
    assert_eq!(slack_sessions.len(), 1);
    assert_eq!(slack_sessions[0].started_at, 10_000);
    assert_eq!(slack_sessions[0].ended_at, 15_000);
    assert_eq!(slack_sessions[0].duration_ms, 5_000);

    // WindowsTerminal ran from regain until the app exited.
    let terminal_sessions: Vec<_> = rows
        .iter()
        .filter(|r| r.hostname == "app://WindowsTerminal")
        .collect();
    assert_eq!(terminal_sessions.len(), 1);
    assert_eq!(terminal_sessions[0].started_at, 21_000);
    assert_eq!(terminal_sessions[0].ended_at, 30_000);

    // Focus telemetry was recorded for the desktop client.
    let lost_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM focus_log WHERE client_id = ? AND kind = 'lost'",
    )
    .bind(CLIENT_ID)
    .fetch_one(&db)
    .await
    .expect("count focus events");
    assert!(lost_count >= 1, "focus was lost at least once");

    let gained_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM focus_log WHERE client_id = ? AND kind = 'gained'",
    )
    .bind(CLIENT_ID)
    .fetch_one(&db)
    .await
    .expect("count gained events");
    assert!(gained_count >= 1, "focus regained after loss");
}