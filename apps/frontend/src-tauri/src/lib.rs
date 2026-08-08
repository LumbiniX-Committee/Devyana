mod ai;
mod behavior;
mod commands;
mod config;
mod db;
mod state;
mod websocket;

use tauri::Manager;

use crate::state::AppState;

fn init_tracing() {
    std::fs::create_dir_all("logs").ok();
    let file_appender = tracing_appender::rolling::daily("logs", "frocus.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(non_blocking)
        .with_ansi(false)
        .init();

    // Keep the log worker alive for the life of the process.
    std::mem::forget(guard);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]), // Runs quietly in background on startup
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();

            let state: AppState = tauri::async_runtime::block_on(AppState::init(handle))?;

            app.manage(state.clone());

            // In-process WebSocket server for the browser extension.
            let ws_state = state.clone();
            tauri::async_runtime::spawn(async move {
                websocket::server::run(ws_state).await;
            });

            // Periodic Intelligence Layer graph refresh.
            let graph_state = state.clone();
            tauri::async_runtime::spawn(async move {
                behavior::graph::spawn_graph_update_loop(graph_state).await;
            });

            tracing::info!("Frocus backend initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::get_sessions,
            commands::sessions::get_session_detail,
            commands::notifications::get_behavior_graph,
            commands::profile::save_profile,
            commands::profile::get_profile,
            commands::constraints::get_constraints,
            commands::constraints::add_constraint,
            commands::constraints::remove_constraint,
            commands::notifications::get_notifications,
            commands::constraints::get_pending_commands_count,
            commands::settings::update_settings,
            commands::settings::get_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}