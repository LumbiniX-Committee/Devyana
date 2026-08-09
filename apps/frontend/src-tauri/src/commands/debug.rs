//! Debug / verification commands for the hackathon pipeline suite.
//!
//! These surface internals (WebSocket port, AI health, raw sessions, seeded
//! fixtures) and expose manual triggers (seed data, force AI batch, point AI
//! at the mock server) so a demo can prove the full Extension -> Tauri ->
//! SQLite -> Intelligence Layer flow on demand.

use std::time::Duration;

use chrono::TimeZone;
use serde::Serialize;
use sqlx::Row;
use tauri::State;

use crate::commands::sessions::SessionView;
use crate::db::analytics_queries as aq;
use crate::db::models::NewSession;
use crate::db::{queries, summaries};
use crate::state::AppState;

const MOCK_AI_BASE: &str = "http://127.0.0.1:8787";

/// The client id used by `seed_test_data` rows, so reseeding replaces the
/// previous fixture set instead of duplicating it.
const SEED_CLIENT_ID: &str = "debug-seed";

// ---------------------------------------------------------------------------
// WebSocket server status
// ---------------------------------------------------------------------------

fn ws_port(state: &AppState) -> Option<u16> {
    state.ws_port.lock().ok().and_then(|g| *g)
}

#[tauri::command]
pub async fn is_ws_running(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(ws_port(&state).is_some())
}

#[tauri::command]
pub async fn get_ws_port(state: State<'_, AppState>) -> Result<Option<u16>, String> {
    Ok(ws_port(&state))
}

#[tauri::command]
pub async fn ping(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "pong": true,
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "wsRunning": ws_port(&state).is_some(),
    }))
}

// ---------------------------------------------------------------------------
// Recent sessions
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_last_n_sessions(
    state: State<'_, AppState>,
    n: i32,
) -> Result<Vec<SessionView>, String> {
    let limit = n.clamp(1, 100);
    let rows = queries::list_sessions(&state.db, limit, 0).await?;
    Ok(rows.into_iter().map(SessionView::from).collect())
}

// ---------------------------------------------------------------------------
// Mock AI configuration
// ---------------------------------------------------------------------------

/// Points the four Intelligence Layer URLs at `scripts/mock_ai.js` (port
/// 8787) and persists the settings. Idempotent; leaves user settings intact.
#[tauri::command]
pub async fn configure_mock_ai(state: State<'_, AppState>) -> Result<crate::config::AppSettings, String> {
    let mut settings = state.settings();
    settings.ai_classify_url = format!("{MOCK_AI_BASE}/classify");
    settings.ai_graph_url = format!("{MOCK_AI_BASE}/behavior/update");
    settings.ai_init_url = format!("{MOCK_AI_BASE}/behavior/init");
    settings.ai_suggest_url = format!("{MOCK_AI_BASE}/suggest");
    state.set_settings(settings.clone());
    state.save_settings()?;
    tracing::info!(urls = %settings.ai_graph_url, "mock AI endpoints configured");
    Ok(settings)
}

// ---------------------------------------------------------------------------
// Seeded test data
// ---------------------------------------------------------------------------

/// One row in the deterministic demo dataset: `day_offset` days before today,
/// at `hour` local time, lasting `duration_min` minutes.
struct SeedPlan {
    day_offset: i64,
    hour: u32,
    hostname: &'static str,
    pathname: &'static str,
    category: &'static str,
    duration_min: i64,
}

/// 10 sessions over the last 7 days, 6 productive + 4 distracting, with
/// predictable totals so the debug dashboard can be verified by eye.
const SEED_PLAN: &[SeedPlan] = &[
    SeedPlan { day_offset: 0, hour: 9, hostname: "youtube.com",   pathname: "/watch?v=learn",    category: "learning",         duration_min: 30 },
    SeedPlan { day_offset: 0, hour: 11, hostname: "youtube.com",   pathname: "/shorts",           category: "dopamine_shorts",  duration_min: 15 },
    SeedPlan { day_offset: 1, hour: 14, hostname: "github.com",    pathname: "/lumbinix/app",    category: "coding",           duration_min: 45 },
    SeedPlan { day_offset: 1, hour: 19, hostname: "instagram.com", pathname: "/",                category: "social_media",     duration_min: 20 },
    SeedPlan { day_offset: 2, hour: 8,  hostname: "docs.rs",       pathname: "/",                category: "writing",          duration_min: 25 },
    SeedPlan { day_offset: 3, hour: 20, hostname: "steam.com",     pathname: "/",                category: "gaming",           duration_min: 60 },
    SeedPlan { day_offset: 4, hour: 10, hostname: "coursera.org",  pathname: "/learn",           category: "learning",         duration_min: 40 },
    SeedPlan { day_offset: 5, hour: 7,  hostname: "wikipedia.org", pathname: "/",                category: "reading",          duration_min: 35 },
    SeedPlan { day_offset: 6, hour: 18, hostname: "amazon.com",    pathname: "/",                category: "shopping",         duration_min: 18 },
    SeedPlan { day_offset: 6, hour: 9,  hostname: "figma.com",     pathname: "/file/demo",       category: "deep_work",        duration_min: 50 },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeededSessionInfo {
    pub day_offset: i64,
    pub date: String,
    pub local_time: String,
    pub hostname: String,
    pub category: String,
    pub duration_minutes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedReport {
    pub seeded_count: usize,
    pub productive_minutes: f64,
    pub distracting_minutes: f64,
    pub today_productive_minutes: f64,
    pub sessions: Vec<SeededSessionInfo>,
}

fn local_midnight_ms(days_back: i64) -> Result<i64, String> {
    let today = chrono::Local::now().date_naive();
    let day = today
        .checked_sub_days(chrono::Days::new(days_back as u64))
        .ok_or("date underflow")?;
    let date_str = day.format("%Y-%m-%d").to_string();
    Ok(aq::day_bounds_ms(&date_str)?.0)
}

/// Inserts the deterministic 10-session demo dataset into `pool` and refreshes
/// the daily summaries for the affected days. Shared by the `seed_test_data`
/// command and the analytics unit test.
pub async fn seed_sessions(pool: &sqlx::SqlitePool) -> Result<SeedReport, String> {
    // Replace any previous demo rows so reseeding stays predictable.
    sqlx::query("DELETE FROM sessions WHERE client_id = ?")
        .bind(SEED_CLIENT_ID)
        .execute(pool)
        .await
        .map_err(|e| format!("clear previous seed rows: {e}"))?;

    let mut sessions = Vec::with_capacity(SEED_PLAN.len());

    for plan in SEED_PLAN {
        let day_start = local_midnight_ms(plan.day_offset)?;
        let started_at = day_start + (plan.hour as i64) * 3_600_000;
        let duration_ms = plan.duration_min * 60_000;
        let id = uuid::Uuid::new_v4().to_string();

        let session = NewSession {
            id: id.clone(),
            client_id: SEED_CLIENT_ID.to_string(),
            browser_type: "chrome".to_string(),
            url: format!("https://{}{}", plan.hostname, plan.pathname),
            hostname: plan.hostname.to_string(),
            pathname: plan.pathname.to_string(),
            meta: None,
            duration_ms,
            started_at,
            ended_at: started_at + duration_ms,
            matched_rules: Vec::new(),
            primary_rule_id: None,
            tab_id: 0,
            aggregated_from: Some(1),
            category: String::new(),
        };

        queries::insert_session(pool, &session).await?;
        queries::update_session_ai_category(pool, &id, plan.category).await?;

        sessions.push(SeededSessionInfo {
            day_offset: plan.day_offset,
            date: summaries::date_key_for_epoch(started_at),
            local_time: format!("{:02}:00", plan.hour),
            hostname: plan.hostname.to_string(),
            category: plan.category.to_string(),
            duration_minutes: plan.duration_min,
        });
    }

    // Refresh the daily rollups so dashboards read the new totals immediately.
    let mut first_date = chrono::Local::now().date_naive();
    first_date = first_date
        .checked_sub_days(chrono::Days::new(6))
        .ok_or("date underflow")?;
    for day in 0..=6 {
        let date = first_date
            .checked_add_days(chrono::Days::new(day as u64))
            .ok_or("date overflow")?;
        summaries::refresh_daily_summary(pool, &date.format("%Y-%m-%d").to_string()).await?;
    }

    let productive_minutes = sessions
        .iter()
        .filter(|s| aq::PRODUCTIVE_CATEGORIES.contains(&s.category.as_str()))
        .map(|s| s.duration_minutes as f64)
        .sum();
    let distracting_minutes = sessions
        .iter()
        .filter(|s| aq::DISTRACTING_CATEGORIES.contains(&s.category.as_str()))
        .map(|s| s.duration_minutes as f64)
        .sum();
    let today_productive_minutes = sessions
        .iter()
        .filter(|s| {
            s.day_offset == 0 && aq::PRODUCTIVE_CATEGORIES.contains(&s.category.as_str())
        })
        .map(|s| s.duration_minutes as f64)
        .sum();

    Ok(SeedReport {
        seeded_count: sessions.len(),
        productive_minutes,
        distracting_minutes,
        today_productive_minutes,
        sessions,
    })
}

#[tauri::command]
pub async fn seed_test_data(state: State<'_, AppState>) -> Result<SeedReport, String> {
    tracing::info!("seeding test data");
    seed_sessions(&state.db).await
}

// ---------------------------------------------------------------------------
// AI batch + status
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn trigger_ai_batch(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    crate::tasks::ai_batcher::flush_now(&state).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatusReport {
    pub last_call_at_ms: i64,
    pub last_success: bool,
    pub last_kind: Option<String>,
    pub last_error: Option<String>,
    pub behavior_graph_version: i64,
    pub behavior_graph_updated_at: Option<String>,
    pub pending_ai_sessions: i64,
    pub classify_url_configured: bool,
    pub graph_url_configured: bool,
    pub init_url_configured: bool,
    pub suggest_url_configured: bool,
    pub last_batch_sent_at: Option<String>,
    pub last_batch_success: Option<bool>,
    pub last_batch_sessions: i64,
}

#[tauri::command]
pub async fn get_ai_status(state: State<'_, AppState>) -> Result<AiStatusReport, String> {
    let health = state.ai_health.snapshot();
    let graph = queries::latest_behavior_graph(&state.db).await?;
    let pending = aq::pending_ai_sessions(&state.db, 10_000).await?.len() as i64;
    let settings = state.settings();

    let batch_row = sqlx::query(
        "SELECT sent_at, success, session_count FROM ai_batches ORDER BY sent_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| format!("read last ai batch: {e}"))?;

    let (last_batch_sent_at, last_batch_success, last_batch_sessions) = match batch_row {
        Some(row) => (
            row.try_get::<String, _>("sent_at").ok(),
            Some(row
                .try_get::<i64, _>("success")
                .map(|v| v != 0)
                .unwrap_or(false)),
            row.try_get::<i64, _>("session_count").unwrap_or(0),
        ),
        None => (None, None, 0),
    };

    Ok(AiStatusReport {
        last_call_at_ms: health.last_call_at_ms,
        last_success: health.last_success,
        last_kind: health.last_kind,
        last_error: health.last_error,
        behavior_graph_version: graph.as_ref().map(|g| g.version).unwrap_or(0),
        behavior_graph_updated_at: graph.map(|g| g.updated_at),
        pending_ai_sessions: pending,
        classify_url_configured: !settings.ai_classify_url.trim().is_empty(),
        graph_url_configured: !settings.ai_graph_url.trim().is_empty(),
        init_url_configured: !settings.ai_init_url.trim().is_empty(),
        suggest_url_configured: !settings.ai_suggest_url.trim().is_empty(),
        last_batch_sent_at,
        last_batch_success,
        last_batch_sessions,
    })
}

// ---------------------------------------------------------------------------
// Combined health report
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub generated_at_ms: i64,
    pub checks: Vec<HealthCheck>,
    pub all_ok: bool,
}

/// Returns true when `url` "answers" anything over HTTP (even a 404/405 proves
/// the server is listening); only transport-level failure means unreachable.
async fn ai_reachable(state: &AppState) -> (bool, String) {
    let settings = state.settings();
    if settings.ai_classify_url.trim().is_empty() {
        return (false, "classify URL not configured".to_string());
    }
    match state
        .ai
        .http
        .get(&settings.ai_classify_url)
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => (true, format!("responded with HTTP {}", resp.status())),
        Err(err) => (false, err.to_string()),
    }
}

#[tauri::command]
pub async fn get_health(state: State<'_, AppState>) -> Result<HealthReport, String> {
    let mut checks: Vec<HealthCheck> = Vec::new();

    // 1. Database connectivity.
    let db_ok = sqlx::query("SELECT 1")
        .fetch_one(&state.db)
        .await
        .is_ok();
    checks.push(HealthCheck {
        name: "database".into(),
        ok: db_ok,
        detail: if db_ok {
            "SELECT 1 ok".into()
        } else {
            "SELECT 1 failed".into()
        },
    });

    // 2. WebSocket server bound.
    let port = ws_port(&state);
    checks.push(HealthCheck {
        name: "websocket_server".into(),
        ok: port.is_some(),
        detail: match port {
            Some(p) => format!("listening on 127.0.0.1:{p}"),
            None => "not bound yet".into(),
        },
    });

    // 3. AI endpoint reachable.
    let (reachable, detail) = ai_reachable(&state).await;
    checks.push(HealthCheck {
        name: "ai_endpoint".into(),
        ok: reachable,
        detail,
    });

    // 4. Last AI call health.
    let health = state.ai_health.snapshot();
    let last_call_ok = health.last_call_at_ms == 0 || health.last_success;
    checks.push(HealthCheck {
        name: "ai_last_call".into(),
        ok: last_call_ok,
        detail: if health.last_call_at_ms == 0 {
            "no AI call yet".to_string()
        } else {
            format!(
                "{} {:?} success={}",
                health.last_kind.as_deref().unwrap_or("?"),
                chrono::Local
                    .timestamp_millis_opt(health.last_call_at_ms)
                    .single()
                    .map(|dt| dt.format("%H:%M:%S").to_string())
                    .unwrap_or_else(|| "?".to_string()),
                health.last_success,
            )
        },
    });

    // 5. Profile present.
    let profile_ok = queries::has_profile(&state.db).await.unwrap_or(false);
    checks.push(HealthCheck {
        name: "profile".into(),
        ok: profile_ok,
        detail: if profile_ok {
            "onboarding complete".into()
        } else {
            "no profile yet (run onboarding)".into()
        },
    });

    // 6. At least one recorded session.
    let latest = queries::list_sessions(&state.db, 1, 0).await.unwrap_or_default();
    let latest_ok = !latest.is_empty();
    checks.push(HealthCheck {
        name: "latest_session".into(),
        ok: latest_ok,
        detail: match latest.first() {
            Some(s) => format!("{} · {} ms", s.hostname, s.duration_ms),
            None => "no sessions recorded yet".into(),
        },
    });

    // 7. Classify / graph configured (informational but counts toward all_ok).
    let settings = state.settings();
    let ai_configured = !settings.ai_classify_url.trim().is_empty()
        && !settings.ai_graph_url.trim().is_empty();
    checks.push(HealthCheck {
        name: "ai_configured".into(),
        ok: ai_configured,
        detail: if ai_configured {
            "classify + graph URLs set".into()
        } else {
            "AI URLs empty — press \"Use mock AI\"".into()
        },
    });

    let all_ok = checks.iter().all(|c| c.ok);
    Ok(HealthReport {
        generated_at_ms: chrono::Utc::now().timestamp_millis(),
        checks,
        all_ok,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_plan_is_well_formed() {
        assert_eq!(SEED_PLAN.len(), 10, "exactly 10 demo sessions");
        for plan in SEED_PLAN {
            assert!(
                aq::PRODUCTIVE_CATEGORIES.contains(&plan.category)
                    || aq::DISTRACTING_CATEGORIES.contains(&plan.category),
                "{} is a known category",
                plan.category
            );
            assert!(plan.duration_min > 0);
        }
        assert!(
            SEED_PLAN.iter().any(|p| p.day_offset == 0),
            "at least one session lands today"
        );
    }

    #[tokio::test]
    async fn seeding_drives_analytics() {
        let dir = std::env::temp_dir().join(format!("viyana-seed-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let pool = crate::db::pool::create_pool(&dir.join("test.db"))
            .await
            .expect("pool");

        let report = seed_sessions(&pool).await.expect("seed");
        assert_eq!(report.seeded_count, 10);
        assert!((report.productive_minutes - 225.0).abs() < 1e-6, "30+45+25+40+35+50");
        assert!((report.distracting_minutes - 113.0).abs() < 1e-6, "15+20+60+18");
        assert!((report.today_productive_minutes - 30.0).abs() < 1e-6);

        // All rows landed with their ai_category recorded.
        let rows = crate::db::queries::list_sessions(&pool, 100, 0)
            .await
            .expect("list");
        assert_eq!(rows.len(), 10);
        assert!(rows.iter().all(|s| s.ai_category.is_some()));

        // Today's 09:00 30-minute learning bucket shows up in the hourly chart.
        let today = summaries::today_key();
        let hours = aq::hourly_activity(&pool, &today, 0, 24).await.expect("hours");
        let h9 = hours.iter().find(|h| h.hour == 9).expect("09h bucket");
        assert!((h9.total_minutes - 30.0).abs() < 1e-6);
        assert!((h9.productive_minutes - 30.0).abs() < 1e-6);

        // Behavior trend: today = 30 productive, 15 distracting minutes.
        let trend = aq::user_behavior_trend(&pool, 30).await.expect("trend");
        let last = trend.last().expect("latest day");
        assert_eq!(last.date, today);
        assert!((last.productive_minutes - 30.0).abs() < 1e-6);
        assert!((last.distracting_minutes - 15.0).abs() < 1e-6);

        // Negative works (7-day window) group the four distracting categories.
        let start = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
            .expect("today parse")
            .checked_sub_days(chrono::Days::new(6))
            .expect("sub days")
            .format("%Y-%m-%d")
            .to_string();
        let works = aq::negative_works(&pool, &start, &today).await.expect("neg works");
        assert_eq!(works.len(), 4);
        let shorts = works
            .iter()
            .find(|w| w.category == "dopamine_shorts")
            .expect("shorts");
        assert!((shorts.total_minutes - 15.0).abs() < 1e-6);

        std::fs::remove_dir_all(&dir).ok();
    }
}