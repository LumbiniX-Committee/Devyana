use sqlx::{Row, SqlitePool};

use super::models::{
    BehaviorGraph, CompleteOnboardingInput, Constraint, NewSession, Notification, PendingCommand,
    Session, UserProfile, UserProfileInput,
};

fn now_string() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

pub async fn insert_session(pool: &SqlitePool, s: &NewSession) -> Result<(), String> {
    let meta = s.meta.as_ref().map(|m| m.to_string());
    let matched = serde_json::to_string(&s.matched_rules).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO sessions (
            id, client_id, browser_type, url, hostname, pathname, meta, tab_id,
            duration_ms, started_at, ended_at, matched_rules, primary_rule_id, aggregated_from
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&s.id)
    .bind(&s.client_id)
    .bind(&s.browser_type)
    .bind(&s.url)
    .bind(&s.hostname)
    .bind(&s.pathname)
    .bind(meta)
    .bind(s.tab_id)
    .bind(s.duration_ms)
    .bind(s.started_at)
    .bind(s.ended_at)
    .bind(&matched)
    .bind(&s.primary_rule_id)
    .bind(s.aggregated_from.unwrap_or(1))
    .execute(pool)
    .await
    .map_err(|e| format!("insert session: {e}"))?;

    Ok(())
}

pub async fn update_session_ai_category(
    pool: &SqlitePool,
    id: &str,
    category: &str,
) -> Result<(), String> {
    sqlx::query("UPDATE sessions SET ai_category = ? WHERE id = ?")
        .bind(category)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("update ai_category: {e}"))?;
    Ok(())
}

pub async fn update_session_ai_result(
    pool: &SqlitePool,
    id: &str,
    category: &str,
    bad_topic: Option<&str>,
) -> Result<(), String> {
    sqlx::query("UPDATE sessions SET ai_category = ?, bad_topic = ? WHERE id = ?")
        .bind(category)
        .bind(bad_topic)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("update Intelligence Layer result: {e}"))?;
    Ok(())
}

pub async fn get_session(pool: &SqlitePool, id: &str) -> Result<Option<Session>, String> {
    sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("select session: {e}"))
}

pub async fn list_sessions(
    pool: &SqlitePool,
    limit: i32,
    offset: i32,
) -> Result<Vec<Session>, String> {
    sqlx::query_as::<_, Session>("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?")
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("list sessions: {e}"))
}

/// Recent sessions in chronological order for the Mental Discipline Score.
pub async fn sessions_since(pool: &SqlitePool, since_ms: i64) -> Result<Vec<Session>, String> {
    sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE ended_at >= ? ORDER BY started_at ASC",
    )
    .bind(since_ms)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list recent sessions: {e}"))
}

/// Sum of `duration_ms` owned by a rule since `since_ms` (inclusive), counting
/// sessions whose primary rule matches or whose matched-rule list contains it.
pub async fn total_time_for_rule_since(
    pool: &SqlitePool,
    rule_id: &str,
    since_ms: i64,
) -> Result<i64, String> {
    let pattern = format!("%\"{rule_id}\"%");
    let row = sqlx::query(
        "SELECT COALESCE(SUM(duration_ms), 0) AS total FROM sessions
         WHERE started_at >= ? AND (primary_rule_id = ? OR matched_rules LIKE ?)",
    )
    .bind(since_ms)
    .bind(rule_id)
    .bind(pattern)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("sum durations: {e}"))?;

    Ok(row.try_get::<i64, _>("total").unwrap_or(0))
}

/// Lightweight recent-session context for the AI classifier.
pub async fn recent_session_context(pool: &SqlitePool, limit: i32) -> Vec<serde_json::Value> {
    match sqlx::query(
        "SELECT url, hostname, pathname, duration_ms, ai_category, started_at
         FROM sessions ORDER BY started_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows
            .into_iter()
            .map(|row| {
                serde_json::json!({
                    "url": row.get::<String, _>("url"),
                    "hostname": row.get::<String, _>("hostname"),
                    "pathname": row.get::<String, _>("pathname"),
                    "durationMs": row.get::<i64, _>("duration_ms"),
                    "category": row.get::<Option<String>, _>("ai_category"),
                    "startedAt": row.get::<i64, _>("started_at"),
                })
            })
            .collect(),
        Err(err) => {
            tracing::warn!(error = ?err, "recent session context unavailable");
            Vec::new()
        }
    }
}

// ---------------------------------------------------------------------------
// Focus log
// ---------------------------------------------------------------------------

pub async fn insert_focus_log(
    pool: &SqlitePool,
    client_id: &str,
    kind: &str,
    at_ms: i64,
) -> Result<(), String> {
    sqlx::query("INSERT INTO focus_log (id, client_id, kind, at) VALUES (?, ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(client_id)
        .bind(kind)
        .bind(at_ms)
        .execute(pool)
        .await
        .map_err(|e| format!("insert focus_log: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

pub async fn get_profile(pool: &SqlitePool) -> Result<Option<UserProfile>, String> {
    sqlx::query_as::<_, UserProfile>("SELECT * FROM user_profile ORDER BY created_at DESC LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("select profile: {e}"))
}

/// True when at least one row exists in `user_profile`. Used by the startup
/// guard to decide whether onboarding should be skipped.
pub async fn has_profile(pool: &SqlitePool) -> Result<bool, String> {
    let row = sqlx::query("SELECT COUNT(*) AS c FROM user_profile")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("count profiles: {e}"))?;

    let count = row.try_get::<i64, _>("c").unwrap_or(0);
    Ok(count > 0)
}

pub async fn get_profile_by_id(pool: &SqlitePool, id: &str) -> Result<Option<UserProfile>, String> {
    sqlx::query_as::<_, UserProfile>("SELECT * FROM user_profile WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("select profile by id: {e}"))
}

pub async fn save_profile(pool: &SqlitePool, input: &UserProfileInput) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let goals = serde_json::to_string(&input.goals).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO user_profile (id, gender, age, profession, goals)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.gender)
    .bind(input.age)
    .bind(&input.profession)
    .bind(&goals)
    .execute(pool)
    .await
    .map_err(|e| format!("insert profile: {e}"))?;

    Ok(())
}

pub async fn upsert_profile(
    pool: &SqlitePool,
    input: &CompleteOnboardingInput,
) -> Result<(), String> {
    let goals = serde_json::to_string(&input.goals).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT OR REPLACE INTO user_profile (id, gender, age, profession, goals, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&input.id)
    .bind(&input.gender)
    .bind(input.age)
    .bind(&input.profession)
    .bind(&goals)
    .execute(pool)
    .await
    .map_err(|e| format!("upsert profile: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Behavior graph
// ---------------------------------------------------------------------------

pub async fn store_behavior_graph(
    pool: &SqlitePool,
    user_id: &str,
    data: &serde_json::Value,
) -> Result<BehaviorGraph, String> {
    let current = latest_behavior_graph(pool).await?;
    let version = current.as_ref().map(|g| g.version + 1).unwrap_or(1);
    let id = uuid::Uuid::new_v4().to_string();
    let graph_data = data.to_string();
    let updated_at = now_string();

    sqlx::query(
        "INSERT INTO behavior_graph (id, user_id, graph_data, version, updated_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&graph_data)
    .bind(version)
    .bind(&updated_at)
    .execute(pool)
    .await
    .map_err(|e| format!("insert behavior_graph: {e}"))?;

    Ok(BehaviorGraph {
        id,
        user_id: Some(user_id.to_string()),
        graph_data,
        version,
        updated_at,
    })
}

pub async fn latest_behavior_graph(pool: &SqlitePool) -> Result<Option<BehaviorGraph>, String> {
    sqlx::query_as::<_, BehaviorGraph>("SELECT * FROM behavior_graph ORDER BY version DESC LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("select behavior_graph: {e}"))
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

pub async fn list_active_constraints(pool: &SqlitePool) -> Result<Vec<Constraint>, String> {
    sqlx::query_as::<_, Constraint>(
        "SELECT * FROM constraints WHERE enabled = 1 ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list constraints: {e}"))
}

pub async fn list_all_constraints(pool: &SqlitePool) -> Result<Vec<Constraint>, String> {
    sqlx::query_as::<_, Constraint>("SELECT * FROM constraints ORDER BY created_at ASC")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("list constraints: {e}"))
}

pub async fn insert_constraint(
    pool: &SqlitePool,
    id: &str,
    definition: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO constraints (id, rule_definition, enabled) VALUES (?, ?, 1)")
        .bind(id)
        .bind(definition)
        .execute(pool)
        .await
        .map_err(|e| format!("insert constraint: {e}"))?;
    Ok(())
}

pub async fn delete_constraint(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM constraints WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("delete constraint: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Pending commands
// ---------------------------------------------------------------------------

pub async fn push_pending_command(
    pool: &SqlitePool,
    client_id: &str,
    command_type: &str,
    payload: &str,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO pending_commands (id, client_id, command_type, payload, delivered)
         VALUES (?, ?, ?, ?, 0)",
    )
    .bind(&id)
    .bind(client_id)
    .bind(command_type)
    .bind(payload)
    .execute(pool)
    .await
    .map_err(|e| format!("insert pending command: {e}"))?;
    Ok(())
}

pub async fn pending_for_client(
    pool: &SqlitePool,
    client_id: &str,
) -> Result<Vec<PendingCommand>, String> {
    sqlx::query_as::<_, PendingCommand>(
        "SELECT * FROM pending_commands WHERE client_id = ? AND delivered = 0
         ORDER BY created_at ASC",
    )
    .bind(client_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("load pending commands: {e}"))
}

pub async fn mark_command_delivered(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("UPDATE pending_commands SET delivered = 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("mark delivered: {e}"))?;
    Ok(())
}

pub async fn count_pending(pool: &SqlitePool) -> Result<i64, String> {
    let row = sqlx::query("SELECT COUNT(*) AS c FROM pending_commands WHERE delivered = 0")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("count pending: {e}"))?;
    Ok(row.try_get::<i64, _>("c").unwrap_or(0))
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

pub async fn list_notifications(pool: &SqlitePool) -> Result<Vec<Notification>, String> {
    sqlx::query_as::<_, Notification>("SELECT * FROM notifications ORDER BY rowid DESC")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("list notifications: {e}"))
}

pub async fn insert_notification(
    pool: &SqlitePool,
    title: &str,
    body: &str,
    kind: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO notifications (id, title, body, kind, sent) VALUES (?, ?, ?, ?, 0)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(title)
        .bind(body)
        .bind(kind)
        .execute(pool)
        .await
        .map_err(|e| format!("insert notification: {e}"))?;
    Ok(())
}
