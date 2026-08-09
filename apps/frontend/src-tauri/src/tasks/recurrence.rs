//! Recurrence helpers for recurring tasks.

use chrono::{DateTime, Local, Utc};
use rrule::{RRule, RRuleSet, Tz, Unvalidated};

/// Upper bound for the occurrence scan. Covers the longest practical rule
/// (e.g. FREQ=WEEKLY over years) while staying fast.
const MAX_OCCURRENCES: u16 = 366;

/// Computes the next occurrence date (`YYYY-MM-DD`, local timezone) strictly
/// after today for an RRULE string such as `"FREQ=DAILY"`.
///
/// The DTSTART anchor is local midnight of today, so completing a daily task
/// today yields tomorrow, a weekly task yields the same weekday next week, etc.
/// Returns `None` when the rule is malformed or has no upcoming occurrences.
pub fn get_next_due_date(rrule_str: &str) -> Option<String> {
    let rrule: RRule<Unvalidated> = rrule_str.trim().parse().ok()?;

    let today = Local::now().date_naive();
    let dtstart_utc: DateTime<Utc> = today
        .and_hms_opt(0, 0, 0)?
        .and_local_timezone(Local)
        .earliest()?
        .with_timezone(&Utc);
    let dtstart: DateTime<Tz> = dtstart_utc.with_timezone(&Tz::UTC);

    let validated = rrule.validate(dtstart).ok()?;
    let set = RRuleSet::new(dtstart).rrule(validated);
    let result = set.all(MAX_OCCURRENCES);

    // `.all` starts at DTSTART, so skip occurrences up to and including today.
    let next = result
        .dates
        .into_iter()
        .find(|d| *d > dtstart)?;
    Some(next.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
use chrono::{Datelike, NaiveDate};

    fn next_due(rule: &str) -> Option<String> {
        get_next_due_date(rule)
    }

    #[test]    fn daily_yields_tomorrow() {
        let tomorrow = (Local::now().date_naive() + chrono::Days::new(1))
            .format("%Y-%m-%d")
            .to_string();
        assert_eq!(next_due("FREQ=DAILY").as_deref(), Some(tomorrow.as_str()));
    }

    #[test]
    fn weekly_yields_seven_days_out() {
        let next = next_due("FREQ=WEEKLY").expect("weekly");
        let target = (Local::now().date_naive() + chrono::Days::new(7))
            .format("%Y-%m-%d")
            .to_string();
        assert_eq!(next, target);
    }

    #[test]
    fn invalid_rules_return_none() {
        assert!(next_due("not a rule").is_none());
        assert!(next_due("").is_none());
    }

    #[test]
    fn interval_day_rules_are_observed() {
        let next = next_due("FREQ=DAILY;INTERVAL=2").expect("every 2 days");
        let naive = NaiveDate::parse_from_str(&next, "%Y-%m-%d").expect("parse");
        let today = Local::now().date_naive();
        let days = naive.num_days_from_ce() - today.num_days_from_ce();
        assert_eq!(days, 2, "respects INTERVAL");
    }
}