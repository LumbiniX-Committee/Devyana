// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_shell::{Command, ShellExt};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]) // Runs quietly in background on startup
        ))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Spawn the sidecar when the app boots (This part is written by AI)
            let sidecar_command = app.shell().sidecar("ws-server").map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            let (mut rx, mut _child) = sidecar_command
                .spawn()
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            tauri::async_runtime::spawn(async move {
                // Read stdout emitted by the sendToTauri ts function
                while let Some(event) = rx.recv().await {
                    if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                        if let Ok(line_str) = String::from_utf8(line) {
                            println!("[Sidecar stdout] {}", line_str);
                            
                            // can emit this directly to frontend if needed
                            // let _ = app.emit("sidecar-event", line_str);
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
