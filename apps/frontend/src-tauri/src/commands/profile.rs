use tauri::State;

use crate::ai::client;
use crate::db::models::{CompleteOnboardingInput, UserProfileInput};
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
            Ok(Some(profile)) => {
                match client::initialize_behavior_graph(&state.ai.http, &state.settings(), &profile)
                    .await
                {
                    Ok(graph) => {
                        match queries::store_behavior_graph(&state.db, &profile.id, &graph).await {
                            Ok(stored) => tracing::info!(
                                user_id = %profile.id,
                                version = stored.version,
                                "behavior graph initialized"
                            ),
                            Err(err) => {
                                tracing::warn!(error = %err, "could not store initial graph")
                            }
                        }
                    }
                    Err(err) => {
                        tracing::warn!(error = %err, "graph initialization deferred (AI not reachable)");
                    }
                }
            }
            Ok(None) => tracing::warn!("saved profile not found"),
            Err(err) => tracing::warn!(error = %err, "could not reload saved profile"),
        }
    });

    Ok(())
}

/// Persists a completed onboarding profile and seeds the Intelligence Layer
/// with an initial behavior graph.
///
/// The profile write is authoritative: it always succeeds (or returns an
/// error) so the frontend can navigate away. Graph initialization is fired in
/// the background; if the AI endpoint is unreachable the profile stays saved
/// and the graph stays in its "pending" state until a background retry
/// (e.g. the AI batcher) picks it up.
#[tauri::command]
pub async fn complete_onboarding(
    state: State<'_, AppState>,
    profile: CompleteOnboardingInput,
) -> Result<(), String> {
    if profile.id.trim().is_empty() {
        return Err("profile id is required".to_string());
    }
    if profile.gender.trim().is_empty() || profile.profession.trim().is_empty() {
        return Err("gender and profession are required".to_string());
    }
    if profile.age <= 0 || profile.age > 120 {
        return Err("age must be between 1 and 120".to_string());
    }
    if profile.goals.is_empty() {
        return Err("at least one goal is required".to_string());
    }

    queries::upsert_profile(&state.db, &profile).await?;

    let state = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        match queries::get_profile_by_id(&state.db, &profile.id).await {
            Ok(Some(profile)) => {
                match client::initialize_behavior_graph(&state.ai.http, &state.settings(), &profile)
                    .await
                {
                    Ok(graph) => {
                        match queries::store_behavior_graph(&state.db, &profile.id, &graph).await {
                            Ok(stored) => tracing::info!(
                                user_id = %profile.id,
                                version = stored.version,
                                "behavior graph initialized from onboarding"
                            ),
                            Err(err) => {
                                tracing::warn!(error = %err, "could not store onboarding graph")
                            }
                        }
                    }
                    Err(err) => {
                        tracing::warn!(error = %err, "onboarding graph deferred (AI not reachable)");
                    }
                }
            }
            Ok(None) => tracing::warn!("onboarding profile not found after upsert"),
            Err(err) => tracing::warn!(error = %err, "could not reload onboarding profile"),
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

/// Startup guard: whether a user profile already exists in the database. The
/// frontend uses this to skip onboarding on subsequent launches. The database
/// is the source of truth — localStorage is only a cache.
#[tauri::command]
pub async fn has_profile(state: State<'_, AppState>) -> Result<bool, String> {
    queries::has_profile(&state.db).await
}
