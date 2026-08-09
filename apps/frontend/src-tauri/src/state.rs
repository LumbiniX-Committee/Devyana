use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};
use tokio::sync::{mpsc, Mutex};

use crate::ai::AiClient;
use crate::config::AppSettings;
use crate::desktop_tracker::DesktopTrackingControl;
use crate::websocket::registry::SharedRegistry;

#[derive(Debug, Clone)]
pub struct PageMetaEntry {
    pub url: String,
    pub meta: serde_json::Value,
    pub at: i64,
}

/// Shared application state managed by Tauri and cloned into every
/// spawned task (WebSocket handlers, AI spawns, background loop).
#[derive(Clone)]
pub struct AppState {
    pub app: AppHandle,
    pub db: SqlitePool,
    pub registry: SharedRegistry,
    pub ai: AiClient,
    pub settings: Arc<RwLock<AppSettings>>,
    pub settings_path: PathBuf,
    pub page_meta_buffer: Arc<RwLock<HashMap<String, Vec<PageMetaEntry>>>>,
    /// Signals the AI batcher that a new classified session is available.
    pub ai_batch_notify: mpsc::UnboundedSender<()>,
    /// Receiver half consumed by `tasks::ai_batcher::start_ai_batcher`.
    pub ai_batch_rx: Arc<Mutex<Option<mpsc::UnboundedReceiver<()>>>>,
    /// Shared control flag for the desktop window tracker daemon.
    pub desktop_tracking: Arc<DesktopTrackingControl>,
}

impl AppState {
    pub async fn init(app: AppHandle) -> Result<AppState, Box<dyn std::error::Error>> {
        let data_dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&data_dir)?;

        let settings_path = data_dir.join("settings.json");
        let settings = AppSettings::load(&settings_path);

        let db_path = data_dir.join("viyana.db");
        let db = crate::db::pool::create_pool(&db_path)
            .await
            .map_err(std::io::Error::other)?;

        let registry = Arc::new(crate::websocket::registry::WsRegistry::new());

        let (ai_batch_notify, ai_batch_rx) = mpsc::unbounded_channel();

        let state = AppState {
            registry,
            db,
            ai: AiClient::new(),
            settings: Arc::new(RwLock::new(settings)),
            settings_path,
            app,
            page_meta_buffer: Arc::new(RwLock::new(HashMap::new())),
            ai_batch_notify,
            ai_batch_rx: Arc::new(Mutex::new(Some(ai_batch_rx))),
            desktop_tracking: Arc::new(DesktopTrackingControl::new()),
        };

        Ok(state)
    }

    pub fn settings(&self) -> AppSettings {
        self.settings.read().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn set_settings(&self, next: AppSettings) {
        if let Ok(mut guard) = self.settings.write() {
            *guard = next;
        }
    }

    pub fn save_settings(&self) -> Result<(), String> {
        let snapshot = self.settings();
        snapshot.save(&self.settings_path)
    }

    /// Buffers a `page_meta_scanned` hit keyed by client + URL, capped per
    /// client to avoid unbounded growth.
    pub fn buffer_page_meta(&self, client_id: &str, url: &str, meta: serde_json::Value) {
        if let Ok(mut map) = self.page_meta_buffer.write() {
            map.entry(client_id.to_string())
                .or_default()
                .push(PageMetaEntry {
                    url: url.to_string(),
                    meta,
                    at: chrono::Utc::now().timestamp_millis(),
                });
            if let Some(vec) = map.get_mut(client_id) {
                if vec.len() > 16 {
                    vec.drain(0..vec.len() - 16);
                }
            }
        }
    }

    /// Attaches the freshest buffered page meta matching `url` to a session.
    pub fn consume_page_meta(&self, client_id: &str, url: &str) -> Option<serde_json::Value> {
        let mut found = None;
        if let Ok(mut map) = self.page_meta_buffer.write() {
            let entries = map.get_mut(client_id);
            if let Some(entries) = entries {
                let idx = entries.iter().rposition(|e| e.url == url);
                if let Some(idx) = idx {
                    found = Some(entries.remove(idx).meta);
                }
            }
        }
        found
    }
}
