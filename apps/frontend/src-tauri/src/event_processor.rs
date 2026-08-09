//! Shared `session_end` pipeline.
//!
//! Both the WebSocket event loop (browser extension) and the desktop window
//! tracker funnel their sessions through `handle_session_end`, so the database
//! insert, constraint evaluation, auto-completion and AI classification run
//! identically regardless of the event's origin.

use crate::db::models::NewSession;
use crate::state::AppState;

/// Stores a session and drives the downstream behavioural pipeline:
///
/// 1. `sessions` insert.
/// 2. Constraint evaluation (rules/limits -> enforcement commands).
/// 3. Fire-and-forget auto-completion against the raw session.
/// 4. Asynchronous AI classification (a second auto-completion pass runs once a
///    category is known, see `ai::spawn_classification`).
///
/// Returns an error only when the database insert itself fails.
pub async fn handle_session_end(state: &AppState, session: NewSession) -> Result<(), String> {
    crate::db::queries::insert_session(&state.db, &session).await?;

    tracing::info!(
        session_id = %session.id,
        client_id = %session.client_id,
        hostname = %session.hostname,
        duration_ms = session.duration_ms,
        aggregated_from = session.aggregated_from.unwrap_or(1),
        "session stored"
    );

    if let Err(err) = crate::behavior::evaluator::evaluate_for_session(state, &session).await {
        tracing::warn!(error = %err, "constraint evaluation failed");
    }

    // Fire-and-forget auto-completion pass against the raw session
    // (rule/duration triggers). The categorized pass runs again after AI
    // classification in `ai::mod.rs`.
    let auto_state = state.clone();
    let auto_session = session.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = crate::tasks::auto_complete::check_auto_complete(&auto_state, &auto_session)
            .await
        {
            tracing::warn!(error = %err, "auto-completion check failed");
        }
    });

    crate::ai::spawn_classification(state, session);

    Ok(())
}