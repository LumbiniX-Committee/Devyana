mod ai;
mod behavior;
mod commands;
mod config;
mod db;
mod desktop_tracker;
mod event_processor;
mod models;
mod state;
mod tasks;
mod websocket;

#[cfg(test)]
mod integration_tests;

use tauri::Manager;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::Layer;

use crate::state::AppState;

fn init_tracing() {
    std::fs::create_dir_all("logs").ok();
    let file_appender = tracing_appender::rolling::daily("logs", "viyana.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_ansi(false).with_filter(filter.clone()))
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false)
                .with_filter(filter),
        )
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

            // Intelligent AI batch flushing (holding window + compression).
            let batcher_state = state.clone();
            tauri::async_runtime::spawn(async move {
                tasks::ai_batcher::start_ai_batcher(batcher_state).await;
            });

            // Incremental daily summary aggregation (5-minute cadence).
            let summary_state = state.clone();
            tauri::async_runtime::spawn(async move {
                tasks::summaries::spawn_summary_refresh(summary_state).await;
            });

            // Raw session data retention / purge.
            let retention_state = state.clone();
            tauri::async_runtime::spawn(async move {
                tasks::data_retention::spawn_data_retention(retention_state).await;
            });

            // Native-app window tracking daemon (desktop sessions feed the same
            // pipeline as the browser extension).
            desktop_tracker::start(state.clone());

            tracing::info!("Viyana backend initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::get_sessions,
            commands::sessions::get_session_detail,
            commands::notifications::get_behavior_graph,
            commands::profile::save_profile,
            commands::profile::complete_onboarding,
            commands::profile::get_profile,
            commands::profile::has_profile,
            commands::constraints::get_constraints,
            commands::constraints::add_constraint,
            commands::constraints::remove_constraint,
            commands::notifications::get_notifications,
            commands::constraints::get_pending_commands_count,
            commands::settings::update_settings,
            commands::settings::get_settings,
            commands::desktop_tracking::toggle_desktop_tracking,
            commands::desktop_tracking::get_desktop_tracking_status,
            commands::analytics::get_daily_focus_summary,
            commands::analytics::get_weekly_report,
            commands::analytics::get_habit_adherence,
            commands::analytics::get_dashboard_snapshot,
            commands::analytics::get_category_breakdown,
            commands::analytics::get_timeline,
            commands::analytics::get_hourly_activity,
            commands::productivity::get_productivity_grid,
            commands::dashboard::get_user_behavior_trend,
            commands::dashboard::get_negative_works,
            commands::dashboard::get_correction_advice,
            commands::tasks::add_task,
            commands::tasks::update_task,
            commands::tasks::delete_task,
            commands::tasks::get_tasks,
            commands::tasks::complete_task,
            commands::tasks::reopen_task,
            commands::tasks::suggest_tasks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
