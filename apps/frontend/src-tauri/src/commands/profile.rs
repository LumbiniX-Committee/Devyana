use tauri::State;

use crate::ai::client;
use crate::db::models::UserProfileInput;
use crate::db::queries;
use crate::state::AppState;

#[tauri::command]
pub async fn save_profile(
    state: State<'_, AppState>,
    profile: UserProfileInput,
) -> Result<(), String> {
    if profile.gender.trim().is_empty() || profile.profession.trim().is_empty() {
        return Err("gender and profession are required".to_string());
    }
    if profile.age <= 0 || profile.age > 120 {
        return Err("age must be between 1 and 120".to_string());
    }

    queries::save_profile(&state.db, &profile).await?;

    // Kick off Intelligence Layer graph initialization in the background so a
    // slow (or merely not-yet-configured) AI endpoint never blocks onboarding.
    let state = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        match queries::get_profile(&state.db).await {
            Ok(Some(profile)) => match client::initialize_behavior_graph(
                &state.ai.http,
                &state.settings(),
                &profile,
            )
            .await
            {
                Ok(graph) => match queries::store_behavior_graph(&state.db, &profile.id, &graph).await
                {
                    Ok(stored) => tracing::info!(
                        user_id = %profile.id,
                        version = stored.version,
                        "behavior graph initialized"
                    ),
                    Err(err) => tracing::warn!(error = %err, "could not store initial graph"),
                },
                Err(err) => {
                    tracing::warn!(error = %err, "graph initialization deferred (AI not reachable)");
                }
            },
            Ok(None) => tracing::warn!("saved profile not found"),
            Err(err) => tracing::warn!(error = %err, "could not reload saved profile"),
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_profile(
    state: State<'_, AppState>,
) -> Result<Option<crate::db::models::UserProfile>, String> {
    queries::get_profile(&state.db).await
}