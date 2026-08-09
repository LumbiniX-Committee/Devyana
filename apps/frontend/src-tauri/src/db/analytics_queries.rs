use std::collections::HashMap;

use chrono::{Datelike, Local, NaiveDate, TimeZone, Timelike};
use sqlx::{Row, SqlitePool};

use crate::db::models::Session;
use crate::models::analytics::{
    CategoryBucket, FocusModeStatus, FocusSummary, HabitAdherence, HourlyActivity, HourlySite,
    SiteStat, Timeline, TimelineBlock,
};
use crate::models::dashboard::{negative_work_description, DailyBehavior, NegativeWorkItem};
use crate::models::tasks::DayProductivity;

/// Categories treated as productive for analytics/insights.
pub const PRODUCTIVE_CATEGORIES: &[&str] = &[
    "productive",
    "deep_work",
    "learning",
    "research",
    "coding",
    "writing",
    "planning",
    "reading",
    "analysis",
];

/// Categories treated as distracting.
pub const DISTRACTING_CATEGORIES: &[&str] = &[
    "distracting",
    "dopamine_shorts",
    "social_media",
    "gaming",
    "streaming",
    "entertainment",
    "shopping",
    "browsing",
    "gambling",
];

/// Categories surfaced as "Negative Works" (unwholesome activities) on the
/// dashboard. The list is intentionally a strict subset of the distracting
/// categories — it powers the reflection cards, not the analytics totals.
pub const NEGATIVE_CATEGORIES: &[&str] = &[
    "distracting",
    "dopamine_shorts",
    "social_media",
    "gambling",
    "adult_content",
    "gaming",
    "streaming",
    "entertainment",
    "shopping",
    "browsing",
];

/// A productive session at least this long counts as a "focus block".
pub const FOCUS_BLOCK_MIN_MS: i64 = 20 * 60 * 1000;

/// Theoretical ceiling (in hours) used to normalise a day's focus time.
pub const PRODUCTIVE_DAY_TARGET_HOURS: f64 = 8.0;

/// Tasks completed in a single day that fully saturate the score's task bonus.
const TASKS_BONUS_TARGET: f64 = 10.0;

/// Theoretical Pomodoro ceiling for the score term (not tracked yet, so it
/// contributes zero until a Pomodoro source exists).
const POMODORO_DAY_TARGET: f64 = 8.0;

/// Builds a SQL `(?, ?, ...)` placeholder list of `n` binds.
fn in_list(n: usize) -> String {
    format!("({})", vec!["?"; n].join(","))
}

fn parse_date(date: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|e| format!("invalid date {date}: {e}"))
}

/// Local midnight (epoch ms) for a calendar date.
fn local_midnight_ms(date: NaiveDate) -> Result<i64, String> {
    let naive = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| format!("invalid midnight for {date}"))?;
    Local
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.timestamp_millis())
        .ok_or_else(|| format!("ambiguous local time for {date}"))
}

/// `(start_ms, end_ms_exclusive)` for a `YYYY-MM-DD` day in local time.
pub fn day_bounds_ms(date: &str) -> Result<(i64, i64), String> {
    let day = parse_date(date)?;
    let start = local_midnight_ms(day)?;
    let end = local_midnight_ms(day.succ_opt().ok_or("date overflow")?)?;
    Ok((start, end))
}

/// Epoch bounds for a date range `[start_date, end_date]` inclusive.
pub fn range_bounds_ms(start_date: &str, end_date: &str) -> Result<(i64, i64), String> {
    let end = parse_date(end_date)?;
    let end_next = end.succ_opt().ok_or("date overflow")?;
    Ok((
        local_midnight_ms(parse_date(start_date)?)?,
        local_midnight_ms(end_next)?,
    ))
}

/// UTC `YYYY-MM-DD HH:MM:SS` stored strings -> local `YYYY-MM-DD`.
fn utc_string_to_local_day(utc: &str) -> Option<String> {
    let naive = chrono::NaiveDateTime::parse_from_str(utc, "%Y-%m-%d %H:%M:%S").ok()?;
    let local = Local.from_utc_datetime(&naive);
    Some(local.format("%Y-%m-%d").to_string())
}

// ---------------------------------------------------------------------------
// Single-day focus summary
// ---------------------------------------------------------------------------

pub async fn focus_summary_for_day(pool: &SqlitePool, date: &str) -> Result<FocusSummary, String> {
    let (start, end) = day_bounds_ms(date)?;
    let productive = PRODUCTIVE_CATEGORIES;
    let distracting = DISTRACTING_CATEGORIES;
    let (ph_p, ph_d) = (in_list(productive.len()), in_list(distracting.len()));

    let sql = format!(
        "SELECT
            COALESCE(SUM(CASE WHEN ai_category IN {ph_p} THEN duration_ms ELSE 0 END), 0) AS focus_ms,
            COALESCE(SUM(CASE WHEN ai_category IN {ph_d} THEN duration_ms ELSE 0 END), 0) AS distraction_ms,
            COALESCE(SUM(CASE WHEN ai_category IN {ph_d} THEN 1 ELSE 0 END), 0) AS distraction_episodes,
            COALESCE(SUM(CASE WHEN ai_category IN {ph_p} AND duration_ms >= {block} THEN 1 ELSE 0 END), 0) AS focus_blocks
         FROM sessions WHERE started_at >= ? AND started_at < ?",
        block = FOCUS_BLOCK_MIN_MS
    );

    let mut query = sqlx::query(&sql);
    // Bind in positional order:
    // 1) productive for the focus SUM, 2-3) distracting for the two distraction
    // aggregates, 4) productive for the focus-block COUNT.
    for category in productive {
        query = query.bind(category);
    }
    for category in distracting {
        query = query.bind(category);
    }
    for category in distracting {
        query = query.bind(category);
    }
    for category in productive {
        query = query.bind(category);
    }
    let row = query
        .bind(start)
        .bind(end)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("daily focus summary: {e}"))?;

    let total_focus_ms = row.try_get::<i64, _>("focus_ms").unwrap_or(0);
    let total_distraction_ms = row.try_get::<i64, _>("distraction_ms").unwrap_or(0);
    let distraction_episodes = row.try_get::<i64, _>("distraction_episodes").unwrap_or(0);
    let focus_blocks = row.try_get::<i64, _>("focus_blocks").unwrap_or(0);

    // Most distracting site of the day.
    let site_sql = format!(
        "SELECT hostname AS host, SUM(duration_ms) AS total FROM sessions
         WHERE started_at >= ? AND started_at < ? AND ai_category IN {ph_d}
         GROUP BY hostname ORDER BY total DESC, MAX(started_at) DESC LIMIT 1"
    );
    let mut site_query = sqlx::query(&site_sql);
    // Textual order: started_at >= ?, started_at < ?, then the IN-list.
    site_query = site_query.bind(start).bind(end);
    for category in distracting {
        site_query = site_query.bind(category);
    }
    let site_row = site_query
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("daily top distraction: {e}"))?;

    let (most_distracting_site, most_distracting_ms) = match site_row {
        Some(row) => (
            row.try_get::<String, _>("host").ok(),
            row.try_get::<i64, _>("total").unwrap_or(0),
        ),
        None => (None, 0),
    };

    Ok(FocusSummary {
        date: date.to_string(),
        total_focus_ms,
        total_distraction_ms,
        focus_blocks,
        distraction_episodes,
        most_distracting_site,
        most_distracting_ms,
    })
}

/// Raw totals for the day (used by the dashboard snapshot and summary table).
pub async fn day_totals(pool: &SqlitePool, date: &str) -> Result<(i64, i64, i64, i64), String> {
    let (start, end) = day_bounds_ms(date)?;
    let productive = PRODUCTIVE_CATEGORIES;
    let distracting = DISTRACTING_CATEGORIES;
    let (ph_p, ph_d) = (in_list(productive.len()), in_list(distracting.len()));

    let sql = format!(
        "SELECT
            COALESCE(SUM(CASE WHEN ai_category IN {ph_p} THEN duration_ms ELSE 0 END), 0) AS focus_ms,
            COALESCE(SUM(CASE WHEN ai_category IN {ph_d} THEN duration_ms ELSE 0 END), 0) AS distraction_ms,
            COALESCE(SUM(CASE WHEN ai_category IN {ph_d} THEN 1 ELSE 0 END), 0) AS distraction_count,
            COALESCE(SUM(CASE WHEN ai_category IN {ph_p} AND duration_ms >= {block} THEN 1 ELSE 0 END), 0) AS focus_blocks
         FROM sessions WHERE started_at >= ? AND started_at < ?",
        block = FOCUS_BLOCK_MIN_MS
    );

    let mut query = sqlx::query(&sql);
    for category in productive {
        query = query.bind(category);
    }
    for category in distracting {
        query = query.bind(category);
    }
    for category in distracting {
        query = query.bind(category);
    }
    for category in productive {
        query = query.bind(category);
    }
    let row = query
        .bind(start)
        .bind(end)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("day totals: {e}"))?;

    Ok((
        row.try_get::<i64, _>("focus_ms").unwrap_or(0),
        row.try_get::<i64, _>("distraction_ms").unwrap_or(0),
        row.try_get::<i64, _>("distraction_count").unwrap_or(0),
        row.try_get::<i64, _>("focus_blocks").unwrap_or(0),
    ))
}

/// `(hostname, total_ms)` for the day's top distraction site, if any.
pub async fn day_top_distraction(
    pool: &SqlitePool,
    date: &str,
) -> Result<(Option<String>, i64), String> {
    let (start, end) = day_bounds_ms(date)?;
    let distracting = DISTRACTING_CATEGORIES;
    let ph_d = in_list(distracting.len());

    let sql = format!(
        "SELECT hostname AS host, SUM(duration_ms) AS total FROM sessions
         WHERE started_at >= ? AND started_at < ? AND ai_category IN {ph_d}
         GROUP BY hostname ORDER BY total DESC, MAX(started_at) DESC LIMIT 1"
    );
    let mut query = sqlx::query(&sql);
    query = query.bind(start).bind(end);
    for category in distracting {
        query = query.bind(category);
    }
    let row = query
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("day top distraction: {e}"))?;

    Ok(match row {
        Some(row) => (
            row.try_get::<String, _>("host").ok(),
            row.try_get::<i64, _>("total").unwrap_or(0),
        ),
        None => (None, 0),
    })
}

/// Total classified sessions recorded in a day (any category).
pub async fn day_session_count(pool: &SqlitePool, date: &str) -> Result<i64, String> {
    let (start, end) = day_bounds_ms(date)?;
    let row = sqlx::query(
        "SELECT COUNT(*) AS c FROM sessions
         WHERE started_at >= ? AND started_at < ? AND ai_category IS NOT NULL",
    )
    .bind(start)
    .bind(end)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("day session count: {e}"))?;
    Ok(row.try_get::<i64, _>("c").unwrap_or(0))
}

/// Minutes of tracked activity per hour-of-day within `[start_hour, end_hour)`,
/// bucketed by each session's *local* start hour (DST‑aware). Hours without any
/// activity are zero-filled so callers can render a contiguous day.
///
/// Minutes are attributed to a single hour bucket by the session's `started_at`
/// (an MVP simplification: sessions spanning an hour boundary are not sliced).
pub async fn hourly_activity(
    pool: &SqlitePool,
    date: &str,
    start_hour: i32,
    end_hour: i32,
) -> Result<Vec<HourlyActivity>, String> {
    if !(0..=24).contains(&start_hour) || !(0..=24).contains(&end_hour) {
        return Err(format!(
            "hours must be in 0..=24, got {start_hour}..{end_hour}"
        ));
    }
    if end_hour <= start_hour {
        return Err(format!(
            "end_hour {end_hour} must follow start_hour {start_hour}"
        ));
    }

    let (start, end) = day_bounds_ms(date)?;
    let rows = sqlx::query(
        "SELECT started_at, duration_ms, ai_category FROM sessions
         WHERE started_at >= ? AND started_at < ?",
    )
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("hourly activity: {e}"))?;

    let mut buckets: HashMap<i32, (f64, f64)> = HashMap::new();
    for row in rows {
        let started_at: i64 = row.try_get("started_at").unwrap_or(0);
        let duration_ms: i64 = row.try_get("duration_ms").unwrap_or(0);
        let category: Option<String> = row
            .try_get::<Option<String>, _>("ai_category")
            .ok()
            .flatten();

        let hour = Local
            .timestamp_millis_opt(started_at)
            .single()
            .map(|dt| dt.hour() as i32)
            .unwrap_or(-1);
        if hour < start_hour || hour >= end_hour {
            continue;
        }

        let minutes = duration_ms as f64 / 60_000.0;
        let productive = category
            .as_deref()
            .map(|c| PRODUCTIVE_CATEGORIES.contains(&c))
            .unwrap_or(false);

        let bucket = buckets.entry(hour).or_insert((0.0, 0.0));
        bucket.0 += minutes;
        if productive {
            bucket.1 += minutes;
        }
    }

    let snap = |x: f64| (x * 100.0).round() / 100.0;
    Ok((start_hour..end_hour)
        .map(|hour| {
            let (total, productive) = buckets.get(&hour).copied().unwrap_or((0.0, 0.0));
            let total = snap(total);
            let productive = snap(productive);
            HourlyActivity {
                hour,
                total_minutes: total,
                productive_minutes: productive,
                distracting_minutes: snap((total - productive).max(0.0)),
            }
        })
        .collect())
}

/// Aggregated per-minute activity *bucket* — total minutes for one site within
/// one hour bucket.
struct SiteHourBucket {
    hostname: String,
    total_minutes: f64,
    productive_minutes: f64,
}

/// Per-site (hostname) hourly minutes for one day, bucketed by each session's
/// *local* start hour (DST‑aware). Hours without activity are zero-filled so
/// each site's chart renders a contiguous day. Every site surveyed gets its
/// own row in the result, ordered by total tracked minutes descending and the
/// dominant AI category attached for colouring.
pub async fn hourly_activity_by_site(
    pool: &SqlitePool,
    date: &str,
    start_hour: i32,
    end_hour: i32,
) -> Result<Vec<HourlySite>, String> {
    if !(0..=24).contains(&start_hour) || !(0..=24).contains(&end_hour) {
        return Err(format!(
            "hours must be in 0..=24, got {start_hour}..{end_hour}"
        ));
    }
    if end_hour <= start_hour {
        return Err(format!(
            "end_hour {end_hour} must follow start_hour {start_hour}"
        ));
    }

    let (start, end) = day_bounds_ms(date)?;
    let rows = sqlx::query(
        "SELECT hostname, started_at, duration_ms, ai_category FROM sessions
         WHERE started_at >= ? AND started_at < ?",
    )
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("hourly activity by site: {e}"))?;

    let mut buckets: HashMap<(String, i32), SiteHourBucket> = HashMap::new();
    let mut category_ms: HashMap<(String, String), f64> = HashMap::new();
    for row in rows {
        let hostname: String = row.try_get("hostname").unwrap_or_default();
        let started_at: i64 = row.try_get("started_at").unwrap_or(0);
        let duration_ms: i64 = row.try_get("duration_ms").unwrap_or(0);
        let category: Option<String> = row
            .try_get::<Option<String>, _>("ai_category")
            .ok()
            .flatten();

        let hour = Local
            .timestamp_millis_opt(started_at)
            .single()
            .map(|dt| dt.hour() as i32)
            .unwrap_or(-1);
        if hour < start_hour || hour >= end_hour {
            continue;
        }

        let minutes = duration_ms as f64 / 60_000.0;
        let productive = category
            .as_deref()
            .map(|c| PRODUCTIVE_CATEGORIES.contains(&c))
            .unwrap_or(false);

        let key = (hostname.clone(), hour);
        let slot = buckets.entry(key).or_insert(SiteHourBucket {
            hostname: hostname.clone(),
            total_minutes: 0.0,
            productive_minutes: 0.0,
        });
        slot.total_minutes += minutes;
        if productive {
            slot.productive_minutes += minutes;
        }
        // Track raw category minutes so we can later pick the dominant one.
        if let Some(cat) = &category {
            *category_ms
                .entry((hostname.clone(), cat.clone()))
                .or_insert(0.0) += minutes;
        }
    }

    // Order sites by total minutes, then attach each site's dominant category.
    let mut totals: HashMap<String, f64> = HashMap::new();
    for slot in buckets.values() {
        *totals.entry(slot.hostname.clone()).or_insert(0.0) += slot.total_minutes;
    }
    let mut hostnames: Vec<String> = totals.keys().cloned().collect();
    hostnames.sort_by(|a, b| {
        totals[b]
            .partial_cmp(&totals[a])
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let snap = |x: f64| (x * 100.0).round() / 100.0;
    Ok(hostnames
        .into_iter()
        .map(|host| {
            let dominant = category_ms
                .iter()
                .filter(|((h, _), _)| h == &host)
                .max_by(|a, b| {
                    a.1.partial_cmp(b.1)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|((_, cat), _)| cat.clone());
            let hours = (start_hour..end_hour)
                .map(|hour| {
                    let slot = buckets.get(&(host.clone(), hour));
                    let (total, productive) = slot
                        .map(|s| (s.total_minutes, s.productive_minutes))
                        .unwrap_or((0.0, 0.0));
                    HourlyActivity {
                        hour,
                        total_minutes: snap(total),
                        productive_minutes: snap(productive),
                        distracting_minutes: snap((total - productive).max(0.0)),
                    }
                })
                .collect();
            HourlySite {
                hostname: host,
                ai_category: dominant,
                hours,
            }
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Productivity grid
// ---------------------------------------------------------------------------

/// One entry per day for `[start_date, end_date]` (inclusive), even for days
/// without any tracked activity. Backed by `daily_summaries` (lazily backfilled)
/// and the tasks table when available.
pub async fn productivity_grid(
    pool: &SqlitePool,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<DayProductivity>, String> {
    let summaries = crate::db::summaries::summaries_in_range(pool, start_date, end_date).await?;
    let completed = crate::db::tasks_queries::completed_per_day(pool, start_date, end_date).await?;
    let completed: std::collections::HashMap<String, i64> = completed.into_iter().collect();

    Ok(summaries
        .into_iter()
        .map(|s| {
            let focus_hours = s.total_focus_ms as f64 / 3_600_000.0;
            let distraction_hours = s.total_distraction_ms as f64 / 3_600_000.0;
            let tasks_completed = completed.get(&s.date).copied().unwrap_or(0);
            // Pomodoros are not persisted yet; keep the field for future use.
            let pomodoro_sessions = 0i32;

            let focus_ratio = (focus_hours / PRODUCTIVE_DAY_TARGET_HOURS).clamp(0.0, 1.0);
            let task_ratio = (tasks_completed as f64 / TASKS_BONUS_TARGET).clamp(0.0, 1.0);
            let pomodoro_ratio = (pomodoro_sessions as f64 / POMODORO_DAY_TARGET).clamp(0.0, 1.0);

            // Deterministic local normalisation: focus is the core signal, with
            // smaller bonuses for completed tasks and (when tracked) Pomodoros.
            let score =
                (0.6 * focus_ratio + 0.3 * task_ratio + 0.1 * pomodoro_ratio).clamp(0.0, 1.0);

            DayProductivity {
                date: s.date,
                score,
                focus_hours: (focus_hours * 100.0).round() / 100.0,
                distraction_hours: (distraction_hours * 100.0).round() / 100.0,
                tasks_completed: tasks_completed as i32,
                pomodoro_sessions,
            }
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Range aggregations
// ---------------------------------------------------------------------------

/// Top `limit` sites by total time in `categories` within the range.
pub async fn top_sites(
    pool: &SqlitePool,
    start_date: &str,
    end_date: &str,
    categories: &[&str],
    limit: i64,
) -> Result<Vec<SiteStat>, String> {
    let (start, end) = range_bounds_ms(start_date, end_date)?;
    let ph = in_list(categories.len());

    let sql = format!(
        "SELECT hostname AS host, SUM(duration_ms) AS total, COUNT(*) AS cnt FROM sessions
         WHERE started_at >= ? AND started_at < ? AND ai_category IN {ph}
         GROUP BY hostname ORDER BY total DESC, MAX(started_at) DESC LIMIT ?"
    );
    let mut query = sqlx::query(&sql);
    // Textual order: started_at >= ?, started_at < ?, IN-list, LIMIT.
    query = query.bind(start).bind(end);
    for category in categories {
        query = query.bind(category);
    }
    let rows = query
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("top sites: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| SiteStat {
            hostname: row.get::<String, _>("host"),
            total_ms: row.get::<i64, _>("total"),
            session_count: row.get::<i64, _>("cnt"),
        })
        .collect())
}

/// Durations grouped by `ai_category` over `[start, end]` (dates inclusive).
pub async fn category_breakdown(
    pool: &SqlitePool,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<CategoryBucket>, String> {
    let (start, end) = range_bounds_ms(start_date, end_date)?;

    let rows = sqlx::query(
        "SELECT ai_category AS category, SUM(duration_ms) AS total, COUNT(*) AS cnt
         FROM sessions
         WHERE started_at >= ? AND started_at < ? AND ai_category IS NOT NULL
         GROUP BY ai_category ORDER BY total DESC",
    )
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("category breakdown: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| CategoryBucket {
            category: row.get::<String, _>("category"),
            total_ms: row.get::<i64, _>("total"),
            session_count: row.get::<i64, _>("cnt"),
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Unified dashboard (behavior trend + negative works)
// ---------------------------------------------------------------------------

/// Daily productive / distracting minutes over the trailing `days` days
/// (inclusive of today), one row per calendar day in local time. Days without
/// any tracked activity are zero-filled so the chart renders a contiguous
/// window. Categories come from the shared hardcoded productive/distracting
/// lists.
pub async fn user_behavior_trend(
    pool: &SqlitePool,
    days: i32,
) -> Result<Vec<DailyBehavior>, String> {
    let days = days.clamp(1, 365);
    let today = Local::now().date_naive();
    let start = today
        .checked_sub_days(chrono::Days::new((days - 1) as u64))
        .ok_or("date underflow")?;
    let start_date = start.format("%Y-%m-%d").to_string();
    let end_date = today.format("%Y-%m-%d").to_string();
    let (start_ms, end_ms) = range_bounds_ms(&start_date, &end_date)?;

    let rows = sqlx::query(
        "SELECT started_at, duration_ms, ai_category FROM sessions
         WHERE started_at >= ? AND started_at < ?",
    )
    .bind(start_ms)
    .bind(end_ms)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("user behavior trend: {e}"))?;

    let mut productive: HashMap<String, f64> = HashMap::new();
    let mut distracting: HashMap<String, f64> = HashMap::new();
    for row in rows {
        let started_at: i64 = row.try_get("started_at").unwrap_or(0);
        let duration_ms: i64 = row.try_get("duration_ms").unwrap_or(0);
        let category: Option<String> = row
            .try_get::<Option<String>, _>("ai_category")
            .ok()
            .flatten();

        let day = crate::db::summaries::date_key_for_epoch(started_at);
        let minutes = duration_ms as f64 / 60_000.0;
        match category.as_deref() {
            Some(c) if PRODUCTIVE_CATEGORIES.contains(&c) => {
                *productive.entry(day).or_insert(0.0) += minutes;
            }
            Some(c) if DISTRACTING_CATEGORIES.contains(&c) => {
                *distracting.entry(day).or_insert(0.0) += minutes;
            }
            _ => {}
        }
    }

    let snap = |x: f64| (x * 100.0).round() / 100.0;
    Ok(crate::db::summaries::day_keys(&start_date, &end_date)?
        .into_iter()
        .map(|date| DailyBehavior {
            productive_minutes: snap(*productive.get(&date).unwrap_or(&0.0)),
            distracting_minutes: snap(*distracting.get(&date).unwrap_or(&0.0)),
            date,
        })
        .collect())
}

/// Durations grouped by Intelligence Layer bad topic (falling back to the
/// category) over `[start_date, end_date]` (inclusive), ordered by total
/// descending. This keeps correction cards specific even though AI verdicts
/// intentionally use the broad productive/neutral/distracting categories.
pub async fn negative_works(
    pool: &SqlitePool,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<NegativeWorkItem>, String> {
    let (start, end) = range_bounds_ms(start_date, end_date)?;
    let ph = in_list(NEGATIVE_CATEGORIES.len());

    let sql = format!(
        "SELECT COALESCE(NULLIF(bad_topic, ''), ai_category) AS category,
                SUM(duration_ms) AS total, COUNT(*) AS cnt
          FROM sessions
          WHERE started_at >= ? AND started_at < ? AND ai_category IN {ph}
          GROUP BY COALESCE(NULLIF(bad_topic, ''), ai_category) ORDER BY total DESC"
    );
    let mut query = sqlx::query(&sql);
    query = query.bind(start).bind(end);
    for category in NEGATIVE_CATEGORIES {
        query = query.bind(category);
    }
    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| format!("negative works: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let category = row.get::<String, _>("category");
            let total_ms = row.get::<i64, _>("total");
            NegativeWorkItem {
                category: category.clone(),
                total_minutes: ((total_ms as f64 / 60_000.0) * 100.0).round() / 100.0,
                session_count: row.get::<i64, _>("cnt") as i32,
                description: negative_work_description(&category),
            }
        })
        .collect())
}

/// Distinct bad-topic labels behind one Negative Works card. The dashboard
/// passes these through to the monk-suggestions endpoint as its context.
pub async fn bad_activities_for_category(
    pool: &SqlitePool,
    category: &str,
) -> Result<Vec<String>, String> {
    let ph = in_list(NEGATIVE_CATEGORIES.len());
    let sql = format!(
        "SELECT DISTINCT COALESCE(NULLIF(bad_topic, ''), ai_category) AS activity
         FROM sessions
         WHERE ai_category IN {ph}
           AND COALESCE(NULLIF(bad_topic, ''), ai_category) = ?
         ORDER BY activity ASC"
    );
    let mut query = sqlx::query(&sql);
    for negative_category in NEGATIVE_CATEGORIES {
        query = query.bind(negative_category);
    }
    let rows = query
        .bind(category)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("negative work activities: {e}"))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("activity").ok())
        .collect())
}

/// Chronological session blocks for a day.
pub async fn timeline(pool: &SqlitePool, date: &str) -> Result<Timeline, String> {
    let (start, end) = day_bounds_ms(date)?;

    let rows = sqlx::query(
        "SELECT id, started_at, ended_at, duration_ms, ai_category, hostname, url
         FROM sessions
         WHERE started_at >= ? AND started_at < ?
         ORDER BY started_at ASC",
    )
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("timeline: {e}"))?;

    let blocks = rows
        .into_iter()
        .map(|row| TimelineBlock {
            id: row.get::<String, _>("id"),
            started_at: row.get::<i64, _>("started_at"),
            ended_at: row.get::<i64, _>("ended_at"),
            duration_ms: row.get::<i64, _>("duration_ms"),
            ai_category: row.get::<Option<String>, _>("ai_category"),
            hostname: row.get::<String, _>("hostname"),
            url: row.get::<String, _>("url"),
        })
        .collect();

    Ok(Timeline {
        date: date.to_string(),
        blocks,
    })
}

// ---------------------------------------------------------------------------
// Dashboard snapshot helpers
// ---------------------------------------------------------------------------

/// Latest focus_log entry -> focus mode status.
pub async fn focus_mode_status(pool: &SqlitePool) -> Result<FocusModeStatus, String> {
    let row = sqlx::query("SELECT kind, at FROM focus_log ORDER BY at DESC LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("focus mode: {e}"))?;

    Ok(match row {
        Some(row) => {
            let kind: String = row.get("kind");
            FocusModeStatus {
                active: kind == "gained",
                since_ms: row.get::<i64, _>("at").into(),
            }
        }
        None => FocusModeStatus {
            active: false,
            since_ms: None,
        },
    })
}

/// Per-primary-rule time consumed today, `(rule_id, used_ms)`.
pub async fn today_rule_usage(pool: &SqlitePool, date: &str) -> Result<Vec<(String, i64)>, String> {
    let (start, end) = day_bounds_ms(date)?;
    let rows = sqlx::query(
        "SELECT primary_rule_id AS rule_id, SUM(duration_ms) AS used
         FROM sessions
         WHERE started_at >= ? AND started_at < ? AND primary_rule_id IS NOT NULL
         GROUP BY primary_rule_id",
    )
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("today rule usage: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| (row.get::<String, _>("rule_id"), row.get::<i64, _>("used")))
        .collect())
}

/// Upcoming (unsent) notifications, soonest first.
pub async fn upcoming_notifications(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<crate::db::models::Notification>, String> {
    sqlx::query_as::<_, crate::db::models::Notification>(
        "SELECT * FROM notifications WHERE sent = 0
         ORDER BY scheduled_at ASC, rowid DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("upcoming notifications: {e}"))
}

// ---------------------------------------------------------------------------
// Habit adherence (habit events live in `notifications`, keyed by `kind`)
// ---------------------------------------------------------------------------

/// Completion/adherence for a habit across `[start_date, end_date]`.
pub async fn habit_adherence(
    pool: &SqlitePool,
    habit_id: &str,
    start_date: &str,
    end_date: &str,
) -> Result<HabitAdherence, String> {
    let start = parse_date(start_date)?;
    let end = parse_date(end_date)?;
    if end < start {
        return Err(format!(
            "end_date {end_date} precedes start_date {start_date}"
        ));
    }

    // Completed days = distinct local dates with a sent notification for the kind.
    let rows = sqlx::query(
        "SELECT substr(scheduled_at, 1, 10) AS day FROM notifications
         WHERE kind = ? AND sent = 1 AND scheduled_at IS NOT NULL",
    )
    .bind(habit_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("habit completions: {e}"))?;

    let completed: std::collections::BTreeSet<String> = rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("day").ok())
        .filter_map(|utc| utc_string_to_local_day(&utc))
        .filter(|day| day.as_str() >= start_date && day.as_str() <= end_date)
        .collect();

    let total_days_i32 = end.num_days_from_ce() - start.num_days_from_ce() + 1;
    let total_days = total_days_i32 as i64;
    let completed_days = completed.len() as i64;
    let missed_days = total_days - completed_days;
    let completion_rate = if total_days > 0 {
        completed_days as f64 / total_days as f64
    } else {
        0.0
    };

    let (longest_streak, current_streak) = compute_streaks(&start, &end, &completed);

    Ok(HabitAdherence {
        habit_id: habit_id.to_string(),
        start_date: start_date.to_string(),
        end_date: end_date.to_string(),
        total_days,
        completed_days,
        missed_days,
        completion_rate,
        longest_streak,
        current_streak,
    })
}

fn compute_streaks(
    start: &NaiveDate,
    end: &NaiveDate,
    completed: &std::collections::BTreeSet<String>,
) -> (i64, i64) {
    let mut current = 0i64;
    // Walk backwards from `end` to find the current streak.
    let mut day = *end;
    loop {
        let key = day.format("%Y-%m-%d").to_string();
        if completed.contains(&key) {
            current += 1;
            day = match day.pred_opt() {
                Some(prev) => prev,
                None => break,
            };
        } else {
            break;
        }
        if day < *start {
            break;
        }
    }

    let mut longest = 0i64;
    let mut run = 0i64;
    let mut day = *start;
    while day <= *end {
        let key = day.format("%Y-%m-%d").to_string();
        if completed.contains(&key) {
            run += 1;
            if run > longest {
                longest = run;
            }
        } else {
            run = 0;
        }
        day = match day.succ_opt() {
            Some(next) => next,
            None => break,
        };
    }

    (longest, current)
}

// ---------------------------------------------------------------------------
// AI batching
// ---------------------------------------------------------------------------

/// Classified-but-unprocessed sessions in chronological order.
pub async fn pending_ai_sessions(pool: &SqlitePool, limit: i64) -> Result<Vec<Session>, String> {
    sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions
         WHERE processed_for_graph = 0 AND ai_category IS NOT NULL
         ORDER BY started_at ASC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("pending ai sessions: {e}"))
}

/// Marks the given session ids as processed inside a single transaction.
pub async fn mark_sessions_processed_tx(pool: &SqlitePool, ids: &[String]) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut tx = pool.begin().await.map_err(|e| format!("begin tx: {e}"))?;
    for chunk in ids.chunks(200) {
        let sql = format!(
            "UPDATE sessions SET processed_for_graph = 1 WHERE id IN {}",
            in_list(chunk.len())
        );
        let mut query = sqlx::query(&sql);
        for id in chunk {
            query = query.bind(id);
        }
        query
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("mark processed: {e}"))?;
    }
    tx.commit().await.map_err(|e| format!("commit: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_bounds_are_consecutive() {
        let (a, b) = day_bounds_ms("2026-08-08").expect("bounds");
        let (c, d) = day_bounds_ms("2026-08-09").expect("bounds");
        assert_eq!(b, c, "end of day N must equal start of day N+1");
        assert_eq!(c - a, 24 * 3600 * 1000, "a full 24h day");
        assert_eq!(d - a, 48 * 3600 * 1000, "two full days");
    }

    #[test]
    fn in_list_placeholders() {
        assert_eq!(in_list(3), "(?,?,?)");
        assert_eq!(in_list(1), "(?)");
    }

    #[test]
    fn utc_to_local_day_parses() {
        let day = utc_string_to_local_day("2026-08-08 12:00:00");
        assert!(day.is_some());
    }

    #[test]
    fn streaks_respect_completions() {
        let start = NaiveDate::from_ymd_opt(2026, 8, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2026, 8, 8).unwrap();
        let completed = [
            "2026-08-01",
            "2026-08-02",
            "2026-08-03",
            "2026-08-05",
            "2026-08-07",
            "2026-08-08",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        let (longest, current) = compute_streaks(&start, &end, &completed);
        assert_eq!(longest, 3, "Aug 1-3 is the longest run");
        assert_eq!(current, 2, "Aug 7-8 is the current run");
    }

    fn make_session(
        id: &str,
        hostname: &str,
        pathname: &str,
        start: i64,
        end: i64,
    ) -> crate::db::models::NewSession {
        crate::db::models::NewSession {
            id: id.to_string(),
            client_id: "client-1".into(),
            browser_type: "chrome".into(),
            url: format!("https://{hostname}{pathname}?token=SECRET"),
            hostname: hostname.to_string(),
            pathname: pathname.to_string(),
            meta: None,
            duration_ms: end - start,
            started_at: start,
            ended_at: end,
            matched_rules: vec!["r1".to_string()],
            primary_rule_id: Some("r1".to_string()),
            tab_id: 1,
            aggregated_from: Some(1),
            category: String::new(),
        }
    }

    #[tokio::test]
    async fn focus_summary_aggregates_daily_totals() {
        let dir = std::env::temp_dir().join(format!("viyana-analytics-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let pool = crate::db::pool::create_pool(&dir.join("test.db"))
            .await
            .expect("pool");

        let today = crate::db::summaries::today_key();
        let (start, _end) = day_bounds_ms(&today).expect("bounds today");
        let tomorrow_start = start + 24 * 3600 * 1000;

        let learning = make_session(
            "s1",
            "youtube.com",
            "/learn",
            start + 3_600_000,
            start + 9_000_000,
        );
        let distracting = make_session(
            "s2",
            "tiktok.com",
            "/feed",
            start + 10_000_000,
            start + 10_800_000,
        );
        // Session on the *next* day: must not leak into today's totals.
        let next_day = make_session(
            "s3",
            "twitter.com",
            "/",
            tomorrow_start,
            tomorrow_start + 60_000,
        );

        for s in [&learning, &distracting, &next_day] {
            crate::db::queries::insert_session(&pool, s)
                .await
                .expect("insert");
        }
        crate::db::queries::update_session_ai_category(&pool, &learning.id, "learning")
            .await
            .expect("cat1");
        crate::db::queries::update_session_ai_category(&pool, &distracting.id, "social_media")
            .await
            .expect("cat2");
        crate::db::queries::update_session_ai_category(&pool, &next_day.id, "learning")
            .await
            .expect("cat3");

        let summary = focus_summary_for_day(&pool, &today).await.expect("summary");
        assert_eq!(summary.total_focus_ms, 5_400_000, "1.5h learning youtube");
        assert_eq!(summary.total_distraction_ms, 800_000, "tiktok");
        assert_eq!(summary.distraction_episodes, 1);
        assert_eq!(summary.focus_blocks, 1, ">= 20 min productive session");
        assert_eq!(summary.most_distracting_site.as_deref(), Some("tiktok.com"));

        // Daily rollup agrees with the direct query.
        crate::db::summaries::refresh_daily_summary(&pool, &today)
            .await
            .expect("rollup");
        let rows = crate::db::summaries::summaries_in_range(&pool, &today, &today)
            .await
            .expect("range");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].total_focus_ms, 5_400_000);
        assert_eq!(rows[0].distraction_count, 1);

        // Category breakdown for the single day does not leak tomorrow.
        let buckets = category_breakdown(&pool, &today, &today)
            .await
            .expect("breakdown");
        assert_eq!(buckets.len(), 2, "learning + social_media only");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn hourly_activity_buckets_by_local_hour() {
        let dir = std::env::temp_dir().join(format!("viyana-hourly-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let pool = crate::db::pool::create_pool(&dir.join("test.db"))
            .await
            .expect("pool");

        let today = crate::db::summaries::today_key();
        let (day_start, _end) = day_bounds_ms(&today).expect("bounds today");
        let local_day = Local
            .timestamp_millis_opt(day_start)
            .single()
            .unwrap()
            .date_naive();

        // 07h local: 30 min learning + 10 min social (40 total, 30 productive).
        let seven = Local
            .from_local_datetime(&local_day.and_hms_opt(7, 0, 0).unwrap())
            .single()
            .unwrap()
            .timestamp_millis();
        // 09h local: 20 min coding.
        let nine = Local
            .from_local_datetime(&local_day.and_hms_opt(9, 0, 0).unwrap())
            .single()
            .unwrap()
            .timestamp_millis();

        let learning = make_session("h1", "github.com", "/", seven, seven + 1_800_000);
        let distracting = make_session(
            "h2",
            "tiktok.com",
            "/",
            seven + 1_800_000,
            seven + 2_400_000,
        );
        let late = make_session("h3", "docs.rs", "/", nine, nine + 1_200_000);

        for s in [&learning, &distracting, &late] {
            crate::db::queries::insert_session(&pool, s)
                .await
                .expect("insert");
        }
        crate::db::queries::update_session_ai_category(&pool, &learning.id, "learning")
            .await
            .expect("cat1");
        crate::db::queries::update_session_ai_category(&pool, &distracting.id, "social_media")
            .await
            .expect("cat2");
        crate::db::queries::update_session_ai_category(&pool, &late.id, "coding")
            .await
            .expect("cat3");

        let hours = hourly_activity(&pool, &today, 6, 18).await.expect("hours");
        assert_eq!(hours.len(), 12, "6AM..6PM = twelve buckets");
        assert_eq!(hours.first().map(|h| h.hour), Some(6));
        assert_eq!(hours.last().map(|h| h.hour), Some(17));

        let h7 = hours.iter().find(|h| h.hour == 7).expect("07h bucket");
        assert!((h7.total_minutes - 40.0).abs() < 1e-6);
        assert!((h7.productive_minutes - 30.0).abs() < 1e-6);
        assert!((h7.distracting_minutes - 10.0).abs() < 1e-6);

        let h9 = hours.iter().find(|h| h.hour == 9).expect("09h bucket");
        assert!((h9.total_minutes - 20.0).abs() < 1e-6);
        assert!((h9.productive_minutes - 20.0).abs() < 1e-6);
        assert!(hours.iter().filter(|h| h.total_minutes > 0.0).count() == 2);

        // A day without any tracked activity renders empty (all zeros).
        let empty = hourly_activity(&pool, "2020-01-01", 6, 18)
            .await
            .expect("empty day");
        assert_eq!(empty.len(), 12);
        assert!(empty
            .iter()
            .all(|h| h.total_minutes == 0.0 && h.distracting_minutes == 0.0));

        assert!(
            hourly_activity(&pool, &today, 18, 6).await.is_err(),
            "inverted range rejected"
        );
        assert!(
            hourly_activity(&pool, &today, -1, 18).await.is_err(),
            "out of range rejected"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn hourly_activity_by_site_splits_rows_per_hostname() {
        let dir = std::env::temp_dir().join(format!("viyana-hoursite-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let pool = crate::db::pool::create_pool(&dir.join("test.db"))
            .await
            .expect("pool");

        let today = crate::db::summaries::today_key();
        let (day_start, _end) = day_bounds_ms(&today).expect("bounds today");
        let local_day = Local
            .timestamp_millis_opt(day_start)
            .single()
            .unwrap()
            .date_naive();

        let nine = Local
            .from_local_datetime(&local_day.and_hms_opt(9, 0, 0).unwrap())
            .single()
            .unwrap()
            .timestamp_millis();
        let ten = Local
            .from_local_datetime(&local_day.and_hms_opt(10, 0, 0).unwrap())
            .single()
            .unwrap()
            .timestamp_millis();

        let github = make_session("g1", "github.com", "/", nine, nine + 1_200_000);
        let tiktok = make_session("t1", "tiktok.com", "/", ten, ten + 900_000);
        for s in [&github, &tiktok] {
            crate::db::queries::insert_session(&pool, s).await.expect("insert");
        }
        crate::db::queries::update_session_ai_category(&pool, &github.id, "coding")
            .await
            .expect("cat1");
        crate::db::queries::update_session_ai_category(&pool, &tiktok.id, "social_media")
            .await
            .expect("cat2");

        let sites = hourly_activity_by_site(&pool, &today, 6, 18)
            .await
            .expect("sites");
        assert_eq!(sites.len(), 2, "one row per hostname");
        assert_eq!(sites[0].hostname, "github.com", "sorted by total minutes desc");
        assert_eq!(sites[0].ai_category.as_deref(), Some("coding"));
        let gh_hour = sites[0]
            .hours
            .iter()
            .find(|h| h.hour == 9)
            .expect("09h bucket");
        assert!((gh_hour.total_minutes - 20.0).abs() < 1e-6);
        assert!((gh_hour.productive_minutes - 20.0).abs() < 1e-6);
        assert_eq!(sites[0].hours.len(), 12, "06:00..18:00 = twelve buckets");

        let tk = sites.iter().find(|s| s.hostname == "tiktok.com").expect("tiktok");
        assert_eq!(tk.ai_category.as_deref(), Some("social_media"));
        let tk_hour = tk.hours.iter().find(|h| h.hour == 10).expect("10h bucket");
        assert!((tk_hour.total_minutes - 15.0).abs() < 1e-6);
        assert!((tk_hour.productive_minutes - 0.0).abs() < 1e-6);
        assert!((tk_hour.distracting_minutes - 15.0).abs() < 1e-6);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn user_behavior_trend_buckets_days_and_zero_fills() {
        let dir = std::env::temp_dir().join(format!("viyana-trend-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let pool = crate::db::pool::create_pool(&dir.join("test.db"))
            .await
            .expect("pool");

        let today = crate::db::summaries::today_key();
        let (day_start, _end) = day_bounds_ms(&today).expect("bounds today");

        // Today: 30 min learning (productive) + 20 min shorts (distracting).
        let learning = make_session("b1", "youtube.com", "/learn", day_start, day_start + 1_800_000);
        let shorts = make_session("b2", "youtube.com", "/shorts", day_start + 1_800_000, day_start + 3_000_000);

        for s in [&learning, &shorts] {
            crate::db::queries::insert_session(&pool, s)
                .await
                .expect("insert");
        }
        crate::db::queries::update_session_ai_category(&pool, &learning.id, "learning")
            .await
            .expect("cat1");
        crate::db::queries::update_session_ai_category(&pool, &shorts.id, "dopamine_shorts")
            .await
            .expect("cat2");

        let trend = user_behavior_trend(&pool, 30).await.expect("trend");
        assert_eq!(trend.len(), 30, "trailing 30 days, zero-filled");
        let last = trend.last().expect("latest day");
        assert_eq!(last.date, today);
        assert!((last.productive_minutes - 30.0).abs() < 1e-6);
        assert!((last.distracting_minutes - 20.0).abs() < 1e-6);
        assert!(trend[0].productive_minutes == 0.0 && trend[0].distracting_minutes == 0.0);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn negative_works_groups_categories_and_count() {
        let dir = std::env::temp_dir().join(format!("viyana-neg-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let pool = crate::db::pool::create_pool(&dir.join("test.db"))
            .await
            .expect("pool");

        let today = crate::db::summaries::today_key();
        let (start, _) = day_bounds_ms(&today).expect("bounds today");

        let shorts_a = make_session("n1", "youtube.com", "/shorts", start, start + 900_000);
        let shorts_b = make_session("n2", "youtube.com", "/shorts", start + 900_000, start + 1_500_000);
        let instagram = make_session("n3", "instagram.com", "/", start + 1_500_000, start + 2_700_000);
        let learning = make_session("n4", "github.com", "/", start + 2_700_000, start + 2_760_000);

        for s in [&shorts_a, &shorts_b, &instagram, &learning] {
            crate::db::queries::insert_session(&pool, s)
                .await
                .expect("insert");
        }
        crate::db::queries::update_session_ai_category(&pool, &shorts_a.id, "dopamine_shorts")
            .await
            .expect("cat1");
        crate::db::queries::update_session_ai_category(&pool, &shorts_b.id, "dopamine_shorts")
            .await
            .expect("cat2");
        crate::db::queries::update_session_ai_category(&pool, &instagram.id, "social_media")
            .await
            .expect("cat3");
        crate::db::queries::update_session_ai_category(&pool, &learning.id, "learning")
            .await
            .expect("cat4");

        let items = negative_works(&pool, &today, &today).await.expect("negative");
        assert_eq!(items.len(), 2, "learning categories are excluded");
        let shorts = items
            .iter()
            .find(|i| i.category == "dopamine_shorts")
            .expect("shorts bucket");
        assert!((shorts.total_minutes - 25.0).abs() < 1e-6, "10 + 15 min");
        assert_eq!(shorts.session_count, 2);
        assert_eq!(shorts.description, "YouTube Shorts");

        let social = items
            .iter()
            .find(|i| i.category == "social_media")
            .expect("social bucket");
        assert!((social.total_minutes - 20.0).abs() < 1e-6);

        std::fs::remove_dir_all(&dir).ok();
    }
}
