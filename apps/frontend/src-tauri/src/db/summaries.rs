use chrono::{Local, NaiveDate, TimeZone, Utc};
use sqlx::{Row, SqlitePool};

use crate::db::analytics_queries as aq;
use crate::db::models::DailySummaryMetrics;

/// `YYYY-MM-DD` (local timezone) key for an epoch-ms timestamp.
pub fn date_key_for_epoch(epoch_ms: i64) -> String {
    Local
        .timestamp_millis_opt(epoch_ms)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// `YYYY-MM-DD` (local timezone) key for "now".
pub fn today_key() -> String {
    date_key_for_epoch(Utc::now().timestamp_millis())
}

/// Iterates inclusive day keys from `start` to `end` (both `YYYY-MM-DD`).
pub fn day_keys(start: &str, end: &str) -> Result<Vec<String>, String> {
    fn parse(s: &str) -> Result<NaiveDate, String> {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| format!("invalid date {s}: {e}"))
    }
    let start = parse(start)?;
    let end = parse(end)?;
    if end < start {
        return Err("end before start".to_string());
    }
    let mut keys = Vec::new();
    let mut day = start;
    while day <= end {
        keys.push(day.format("%Y-%m-%d").to_string());
        day = day.succ_opt().ok_or("date overflow")?;
    }
    Ok(keys)
}

fn now_string() -> String {
    Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Recomputes the aggregate for `date` from raw sessions and UPSERTs it.
/// Idempotent: safe to run every few minutes or after each new session.
pub async fn refresh_daily_summary(pool: &SqlitePool, date: &str) -> Result<(), String> {
    let (focus_ms, distraction_ms, distraction_count, _focus_blocks) =
        aq::day_totals(pool, date).await?;
    let (top_site, top_ms) = aq::day_top_distraction(pool, date).await?;
    let session_count = aq::day_session_count(pool, date).await?;

    upsert_daily_summary(
        pool,
        date,
        focus_ms,
        distraction_ms,
        distraction_count,
        session_count,
        top_site.as_deref(),
        top_ms,
    )
    .await
}

/// `INSERT ... ON CONFLICT(date) DO UPDATE` — incremental aggregation.
pub async fn upsert_daily_summary(
    pool: &SqlitePool,
    date: &str,
    total_focus_ms: i64,
    total_distraction_ms: i64,
    distraction_count: i64,
    session_count: i64,
    top_distraction_site: Option<&str>,
    top_distraction_ms: i64,
) -> Result<(), String> {
    let id = format!("{date}-summary");
    sqlx::query(
        "INSERT INTO daily_summaries (
            id, date, total_focus_ms, total_distraction_ms, distraction_count,
            session_count, top_distraction_site, top_distraction_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            total_focus_ms = excluded.total_focus_ms,
            total_distraction_ms = excluded.total_distraction_ms,
            distraction_count = excluded.distraction_count,
            session_count = excluded.session_count,
            top_distraction_site = excluded.top_distraction_site,
            top_distraction_ms = excluded.top_distraction_ms,
            created_at = excluded.created_at",
    )
    .bind(&id)
    .bind(date)
    .bind(total_focus_ms)
    .bind(total_distraction_ms)
    .bind(distraction_count)
    .bind(session_count)
    .bind(top_distraction_site)
    .bind(top_distraction_ms)
    .bind(now_string())
    .execute(pool)
    .await
    .map_err(|e| format!("upsert daily summary: {e}"))?;
    Ok(())
}

/// Backfills missing `daily_summaries` rows for a date range (inclusive).
pub async fn ensure_daily_summaries(
    pool: &SqlitePool,
    start_date: &str,
    end_date: &str,
) -> Result<(), String> {
    let keys = day_keys(start_date, end_date)?;
    for date in keys {
        let exists: bool = sqlx::query("SELECT 1 FROM daily_summaries WHERE date = ?")
            .bind(&date)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("check summary: {e}"))?
            .is_some();
        if !exists {
            refresh_daily_summary(pool, &date).await?;
        }
    }
    Ok(())
}

/// Reads summaries for `[start, end]` (inclusive), filling gaps with zeroes.
pub async fn summaries_in_range(
    pool: &SqlitePool,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<DailySummaryMetrics>, String> {
    ensure_daily_summaries(pool, start_date, end_date).await?;

    let rows = sqlx::query(
        "SELECT date, total_focus_ms, total_distraction_ms, distraction_count,
                session_count, top_distraction_site, top_distraction_ms
         FROM daily_summaries WHERE date >= ? AND date <= ?
         ORDER BY date ASC",
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("summaries in range: {e}"))?;

    let mut mapped: std::collections::HashMap<String, DailySummaryMetrics> = rows
        .into_iter()
        .map(|row| {
            let entry = DailySummaryMetrics {
                date: row.get::<String, _>("date"),
                total_focus_ms: row.get::<i64, _>("total_focus_ms"),
                total_distraction_ms: row.get::<i64, _>("total_distraction_ms"),
                distraction_count: row.get::<i64, _>("distraction_count"),
                session_count: row.get::<i64, _>("session_count"),
                top_distraction_site: row.get::<Option<String>, _>("top_distraction_site"),
                top_distraction_ms: row.get::<i64, _>("top_distraction_ms"),
            };
            (entry.date.clone(), entry)
        })
        .collect();

    let mut out = Vec::new();
    for date in day_keys(start_date, end_date)? {
        out.push(
            mapped
                .remove(&date)
                .unwrap_or_else(Default::default),
        );
    }
    Ok(out)
}

/// Single summary for a date, lazily building the row when requested.
#[allow(dead_code)]
pub async fn summary_for_date(
    pool: &SqlitePool,
    date: &str,
) -> Result<DailySummaryMetrics, String> {
    let mut items = summaries_in_range(pool, date, date).await?;
    Ok(items.pop().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_keys_span_inclusive() {
        let keys = day_keys("2026-08-01", "2026-08-03").expect("keys");
        assert_eq!(keys, vec!["2026-08-01", "2026-08-02", "2026-08-03"]);
    }

    #[test]
    fn rejects_reversed_range() {
        assert!(day_keys("2026-08-05", "2026-08-01").is_err());
    }

    #[test]
    fn date_key_is_zero_padded() {
        let key = date_key_for_epoch(1_700_000_000_000);
        assert_eq!(key.len(), 10, "YYYY-MM-DD shape");
    }
}