use std::time::Duration;

use crate::state::AppState;

/// Milliseconds in one day.
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// Deletes raw session rows (and focus log entries) older than the configured
/// retention window. Aggregated `daily_summaries` are intentionally preserved.
pub async fn purge_old_data(state: &AppState) -> Result<(), String> {
    let retention_days = state.settings().session_retention_days.max(1);
    let cutoff_ms = chrono::Utc::now().timestamp_millis() - (retention_days as i64) * DAY_MS;

    let sessions = sqlx::query("DELETE FROM sessions WHERE ended_at < ?")
        .bind(cutoff_ms)
        .execute(&state.db)
        .await
        .map_err(|e| format!("purge sessions: {e}"))?;

    let focus = sqlx::query("DELETE FROM focus_log WHERE at < ?")
        .bind(cutoff_ms)
        .execute(&state.db)
        .await
        .map_err(|e| format!("purge focus log: {e}"))?;

    tracing::info!(
        retention_days,
        deleted_sessions = sessions.rows_affected(),
        deleted_focus_events = focus.rows_affected(),
        "data retention purge"
    );
    Ok(())
}

/// Periodic loop: runs on startup, then once every 6 hours.
pub async fn spawn_data_retention(state: AppState) {
    if let Err(err) = purge_old_data(&state).await {
        tracing::warn!(error = %err, "initial retention purge failed");
    }

    let mut ticker = tokio::time::interval(Duration::from_secs(6 * 3600));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        ticker.tick().await;
        if let Err(err) = purge_old_data(&state).await {
            tracing::warn!(error = %err, "periodic retention purge failed");
        }
    }
}
