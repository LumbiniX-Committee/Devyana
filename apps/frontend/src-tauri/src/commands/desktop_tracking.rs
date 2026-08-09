use tauri::State;

use crate::state::AppState;

/// Pauses/resumes the desktop window tracker without restarting the daemon and
/// persists the preference. Emits `desktop_tracking_status` to the frontend.
#[tauri::command]
pub async fn toggle_desktop_tracking(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<bool, String> {
    crate::desktop_tracker::set_enabled(&state, enabled)?;
    Ok(enabled)
}

/// Current on/off state of the desktop window tracker.
#[tauri::command]
pub async fn get_desktop_tracking_status(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.desktop_tracking.enabled())
}