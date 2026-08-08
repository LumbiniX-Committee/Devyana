use tauri::State;

use crate::config::AppSettings;
use crate::state::AppState;

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    state.set_settings(settings.clone());
    state.save_settings()?;
    tracing::info!("settings updated");
    Ok(())
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(state.settings())
}