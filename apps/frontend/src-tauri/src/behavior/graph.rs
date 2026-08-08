use crate::db::models::Session;
use crate::state::AppState;

/// Serializes a session row for the Intelligence Layer graph request.
fn session_payload(s: &Session) -> serde_json::Value {
    let meta = s
        .meta
        .as_ref()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let matched = s
        .matched_rules
        .split(',')
        .map(|id| id.trim_matches('"').trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<Vec<_>>();

    serde_json::json!({
        "id": s.id,
        "clientId": s.client_id,
        "browserType": s.browser_type,
        "url": s.url,
        "hostname": s.hostname,
        "pathname": s.pathname,
        "meta": meta,
        "durationMs": s.duration_ms,
        "startedAt": s.started_at,
        "endedAt": s.ended_at,
        "matchedRules": matched,
        "primaryRuleId": s.primary_rule_id,
        "aggregatedFrom": s.aggregated_from,
        "category": s.ai_category,
    })
}

fn epoch_string() -> String {
    "1970-01-01 00:00:00".to_string()
}

/// Applies constraint adjustments the AI may have embedded in the graph update.
async fn apply_graph_recommendations(
    state: &AppState,
    graph: &serde_json::Value,
) -> Result<(), String> {
    let Some(recommendations) = graph.get("recommendedConstraints").cloned() else {
        return Ok(());
    };

    let items = match recommendations {
        serde_json::Value::Array(items) => items,
        _ => return Ok(()),
    };

    for item in items {
        let definition = match serde_json::from_value::<crate::behavior::constraints::ConstraintDefinition>(item)
        {
            Ok(def) => def,
            Err(err) => {
                tracing::debug!(error = %err, "skipping malformed recommended constraint");
                continue;
            }
        };
        if definition.limit_ms <= 0 {
            continue;
        }
        let payload = serde_json::to_string(&definition).map_err(|e| e.to_string())?;
        crate::db::queries::insert_constraint(&state.db, &definition.rule.id, &payload).await?;
        tracing::info!(rule_id = %definition.rule.id, "persisted recommended constraint from graph");
    }

    Ok(())
}

/// Periodic graph refresh: batches newly categorized sessions and asks the
/// Intelligence Layer for an updated behavior graph.
pub async fn maybe_update_graph(state: &AppState) -> Result<(), String> {
    let settings = state.settings();

    let Some(profile) = crate::db::queries::get_profile(&state.db).await? else {
        tracing::debug!("no profile yet; skipping graph update");
        return Ok(());
    };

    let since = crate::db::queries::latest_behavior_graph(&state.db)
        .await?
        .map(|g| g.updated_at)
        .unwrap_or_else(epoch_string);

    let batch = crate::db::queries::sessions_for_graph_update(&state.db, &since, 200).await?;

    if batch.is_empty() {
        return Ok(());
    }
    if (batch.len() as i64) < settings.graph_batch_threshold {
        tracing::debug!(
            pending = batch.len(),
            threshold = settings.graph_batch_threshold,
            "not enough unprocessed sessions yet"
        );
        return Ok(());
    }

    let payload: Vec<serde_json::Value> = batch.iter().map(session_payload).collect();

    let graph = crate::ai::client::update_behavior_graph(
        &state.ai.http,
        &settings,
        &profile.id,
        &payload,
    )
    .await
    .map_err(|e| e.to_string())?;

    crate::db::queries::store_behavior_graph(&state.db, &profile.id, &graph).await?;

    let ids: Vec<String> = batch.iter().map(|s| s.id.clone()).collect();
    crate::db::queries::mark_sessions_processed(&state.db, &ids).await?;

    tracing::info!(
        user_id = %profile.id,
        sessions = batch.len(),
        "behavior graph updated"
    );

    apply_graph_recommendations(state, &graph).await
}

/// Periodic loop driver. Runs inside a Tauri background task forever.
pub async fn spawn_graph_update_loop(state: AppState) {
    let interval_secs = state.settings().graph_update_interval_secs.max(1);
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;
        if let Err(err) = maybe_update_graph(&state).await {
            tracing::warn!(error = %err, "periodic graph update failed");
        }
    }
}