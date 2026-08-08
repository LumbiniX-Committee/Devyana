use crate::state::AppState;

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
        let definition =
            match serde_json::from_value::<crate::behavior::constraints::ConstraintDefinition>(item)
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

/// Persists a graph update returned by the Intelligence Layer and applies any
/// suggested constraints. Used by the AI batcher after each successful flush.
pub async fn persist_graph_update(
    state: &AppState,
    user_id: &str,
    graph: &serde_json::Value,
) -> Result<(), String> {
    crate::db::queries::store_behavior_graph(&state.db, user_id, graph).await?;
    apply_graph_recommendations(state, graph).await
}
