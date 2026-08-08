use std::collections::HashMap;

use tauri::State;

use crate::behavior::constraints::ConstraintDefinition;
use crate::db::analytics_queries as aq;
use crate::db::models::DailySummaryMetrics;
use crate::db::{queries, summaries};
use crate::models::analytics::{
    ActiveConstraint, CategoryBucket, DashboardSnapshot, DailyReport, FocusSummary, FocusTrend,
    HabitAdherence, RuleUsage, Timeline, WeeklyReport,
};
use crate::state::AppState;

#[tauri::command]
pub async fn get_daily_focus_summary(
    state: State<'_, AppState>,
    date: String,
) -> Result<FocusSummary, String> {
    if date == summaries::today_key() {
        // Keep today's rollup warm for fast dashboard reads.
        summaries::refresh_daily_summary(&state.db, &date).await?;
    }
    aq::focus_summary_for_day(&state.db, &date).await
}

#[tauri::command]
pub async fn get_weekly_report(
    state: State<'_, AppState>,
    start_date: String,
) -> Result<WeeklyReport, String> {
    weekly_report(&state.db, &start_date).await
}

#[tauri::command]
pub async fn get_habit_adherence(
    state: State<'_, AppState>,
    habit_id: String,
    start_date: String,
    end_date: String,
) -> Result<HabitAdherence, String> {
    aq::habit_adherence(&state.db, &habit_id, &start_date, &end_date).await
}

#[tauri::command]
pub async fn get_dashboard_snapshot(
    state: State<'_, AppState>,
) -> Result<DashboardSnapshot, String> {
    let date = summaries::today_key();
    summaries::refresh_daily_summary(&state.db, &date).await?;

    let (focus_ms, distraction_ms, _count, focus_blocks) = aq::day_totals(&state.db, &date).await?;

    let constraint_rows = queries::list_active_constraints(&state.db).await?;
    let mut active_constraints = Vec::new();
    let mut rule_limits: HashMap<String, i64> = HashMap::new();
    for row in &constraint_rows {
        if let Ok(def) = ConstraintDefinition::parse(&row.rule_definition) {
            active_constraints.push(ActiveConstraint {
                id: row.id.clone(),
                rule_id: def.rule.id.clone(),
                action: def.action.clone(),
                scope: def.scope.clone(),
                limit_ms: def.limit_ms,
            });
            rule_limits.entry(def.rule.id.clone()).or_insert(def.limit_ms);
        }
    }

    let usage = aq::today_rule_usage(&state.db, &date)
        .await?
        .into_iter()
        .filter_map(|(rule_id, used_ms)| {
            let limit_ms = rule_limits.get(&rule_id).copied()?;
            Some(RuleUsage { rule_id, used_ms, limit_ms })
        })
        .collect();

    let upcoming_reminders = aq::upcoming_notifications(&state.db, 10).await?;
    let focus_mode = aq::focus_mode_status(&state.db).await?;
    let pending_interventions = queries::count_pending(&state.db).await?;

    Ok(DashboardSnapshot {
        date,
        focus_ms_so_far: focus_ms,
        focus_blocks_so_far: focus_blocks,
        distraction_ms_so_far: distraction_ms,
        active_constraints,
        usage,
        upcoming_reminders,
        focus_mode,
        cooldowns: Vec::new(), // MVP: intervention cooldowns are not persisted yet
        pending_interventions,
    })
}

#[tauri::command]
pub async fn get_category_breakdown(
    state: State<'_, AppState>,
    start: String,
    end: String,
) -> Result<Vec<CategoryBucket>, String> {
    aq::category_breakdown(&state.db, &start, &end).await
}

#[tauri::command]
pub async fn get_timeline(state: State<'_, AppState>, date: String) -> Result<Timeline, String> {
    aq::timeline(&state.db, &date).await
}

/// Assembles a 7-day report from daily summaries + range aggregations.
async fn weekly_report(
    pool: &sqlx::SqlitePool,
    start_date: &str,
) -> Result<WeeklyReport, String> {
    let start = chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|e| format!("invalid start_date {start_date}: {e}"))?;
    let end = start
        .checked_add_days(chrono::Days::new(6))
        .ok_or("date overflow")?;
    let end_date = end.format("%Y-%m-%d").to_string();

    let metrics = summaries::summaries_in_range(pool, start_date, &end_date).await?;

    let days: Vec<DailyReport> = metrics
        .iter()
        .map(|m: &DailySummaryMetrics| DailyReport {
            date: m.date.clone(),
            total_focus_ms: m.total_focus_ms,
            total_distraction_ms: m.total_distraction_ms,
            distraction_episodes: m.distraction_count,
        })
        .collect();

    let total_focus_ms: i64 = metrics.iter().map(|m| m.total_focus_ms).sum();
    let total_distraction_ms: i64 = metrics.iter().map(|m| m.total_distraction_ms).sum();

    let focus_trend = if metrics.len() >= 2 {
        let first = metrics.first().map(|m| m.total_focus_ms).unwrap_or(0);
        let last = metrics.last().map(|m| m.total_focus_ms).unwrap_or(0);
        if last > first + first / 20 {
            FocusTrend::Up
        } else if last < first - first / 20 {
            FocusTrend::Down
        } else {
            FocusTrend::Flat
        }
    } else {
        FocusTrend::Flat
    };

    let avg_daily_distraction_count = if metrics.is_empty() {
        0.0
    } else {
        metrics.iter().map(|m| m.distraction_count as f64).sum::<f64>() / metrics.len() as f64
    };

    let top_distractions =
        aq::top_sites(pool, start_date, &end_date, aq::DISTRACTING_CATEGORIES, 5).await?;
    let top_productive_sites =
        aq::top_sites(pool, start_date, &end_date, aq::PRODUCTIVE_CATEGORIES, 5).await?;

    Ok(WeeklyReport {
        start_date: start_date.to_string(),
        end_date,
        total_focus_ms,
        total_distraction_ms,
        focus_trend,
        top_distractions,
        top_productive_sites,
        days,
        avg_daily_distraction_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_summary_defaults_are_zero() {
        let s = DashboardSnapshot {
            date: "2026-08-08".into(),
            active_constraints: vec![],
            focus_mode: crate::models::analytics::FocusModeStatus { active: false, since_ms: None },
            cooldowns: vec![],
            usage: vec![],
            upcoming_reminders: vec![],
            focus_ms_so_far: 0,
            focus_blocks_so_far: 0,
            distraction_ms_so_far: 0,
            pending_interventions: 0,
        };
        assert_eq!(s.focus_ms_so_far + s.distraction_ms_so_far, 0);
    }
}