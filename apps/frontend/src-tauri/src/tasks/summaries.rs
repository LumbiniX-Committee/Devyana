use std::time::Duration;

use crate::state::AppState;

/// Periodic refresh of today's `daily_summaries` row. Runs on startup and then
/// every `settings.summary_interval_secs` (5 minutes by default) so the
/// dashboard stays near real-time without scanning raw sessions per request.
pub async fn spawn_summary_refresh(state: AppState) {
    let interval_secs = state.settings().summary_interval_secs.max(60);
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;
        let today = crate::db::summaries::today_key();
        if let Err(err) = crate::db::summaries::refresh_daily_summary(&state.db, &today).await {
            tracing::warn!(error = %err, "daily summary refresh failed");
        }
    }
}
