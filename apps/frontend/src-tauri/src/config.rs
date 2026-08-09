use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

fn default_origins() -> Vec<String> {
    vec!["chrome-extension://".to_string()]
}

fn default_graph_batch_threshold() -> i64 {
    20
}

fn default_graph_update_interval_secs() -> u64 {
    600
}

fn default_ack_batch_size() -> usize {
    10
}

fn default_ai_batch_interval_secs() -> u64 {
    1800
}

fn default_ai_batch_min_size() -> usize {
    20
}

fn default_ai_batch_max_age_secs() -> u64 {
    3600
}

fn default_ai_send_full_meta() -> bool {
    false
}

fn default_session_retention_days() -> u64 {
    90
}

fn default_ai_url_whitelist() -> Vec<String> {
    vec!["v", "t", "list", "q", "ref"]
        .into_iter()
        .map(String::from)
        .collect()
}

/// How often the daily summary for the current day is recomputed.
fn default_summary_interval_secs() -> u64 {
    300
}

/// Application-level settings. Persisted as JSON in the app data directory.
/// The AI API key is stored here for the MVP; a future iteration should move
/// it into the OS keychain (e.g. tauri-plugin-stronghold).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub ai_classify_url: String,
    #[serde(default)]
    pub ai_graph_url: String,
    #[serde(default)]
    pub ai_init_url: String,
    /// Endpoint that turns the behavior graph + profile into task suggestions.
    #[serde(default)]
    pub ai_suggest_url: String,
    #[serde(default)]
    pub ai_api_key: String,
    /// Origins permitted to open the WebSocket. Prefix match ("" denies all,
    /// an empty list allows every origin for local development).
    #[serde(default = "default_origins")]
    pub allowed_origins: Vec<String>,
    /// Minimum number of unprocessed sessions that trigger a graph update.
    #[serde(default = "default_graph_batch_threshold")]
    pub graph_batch_threshold: i64,
    /// How often the background loop checks for sessions to batch.
    #[serde(default = "default_graph_update_interval_secs")]
    pub graph_update_interval_secs: u64,
    /// Number of entry ids accumulated before a batch ack is flushed.
    #[serde(default = "default_ack_batch_size")]
    pub ack_batch_size: usize,
    /// Holding-window interval: how often the AI batcher flushes by timer.
    #[serde(default = "default_ai_batch_interval_secs")]
    pub ai_batch_interval_secs: u64,
    /// Minimum number of new classified sessions before an early flush.
    #[serde(default = "default_ai_batch_min_size")]
    pub ai_batch_min_size: usize,
    /// Maximum age of the oldest queued session before a forced flush.
    #[serde(default = "default_ai_batch_max_age_secs")]
    pub ai_batch_max_age_secs: u64,
    /// Whether the full page `meta` payload is sent to the Intelligence Layer.
    #[serde(default = "default_ai_send_full_meta")]
    pub ai_send_full_meta: bool,
    /// How long raw session rows are kept before the retention purge deletes
    /// them. Aggregated summaries are retained indefinitely.
    #[serde(default = "default_session_retention_days")]
    pub session_retention_days: u64,
    /// Query parameters that survive `sanitize_url_for_ai`.
    #[serde(default = "default_ai_url_whitelist")]
    pub ai_url_whitelist: Vec<String>,
    /// How often the current day's daily_summaries row is refreshed.
    #[serde(default = "default_summary_interval_secs")]
    pub summary_interval_secs: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ai_classify_url: String::new(),
            ai_graph_url: String::new(),
            ai_init_url: String::new(),
            ai_suggest_url: String::new(),
            ai_api_key: String::new(),
            allowed_origins: default_origins(),
            graph_batch_threshold: default_graph_batch_threshold(),
            graph_update_interval_secs: default_graph_update_interval_secs(),
            ack_batch_size: default_ack_batch_size(),
            ai_batch_interval_secs: default_ai_batch_interval_secs(),
            ai_batch_min_size: default_ai_batch_min_size(),
            ai_batch_max_age_secs: default_ai_batch_max_age_secs(),
            ai_send_full_meta: default_ai_send_full_meta(),
            session_retention_days: default_session_retention_days(),
            ai_url_whitelist: default_ai_url_whitelist(),
            summary_interval_secs: default_summary_interval_secs(),
        }
    }
}

impl AppSettings {
    pub fn load(path: &PathBuf) -> Self {
        match fs::read_to_string(path) {
            Ok(raw) => match serde_json::from_str(&raw) {
                Ok(settings) => settings,
                Err(err) => {
                    tracing::warn!(%err, "failed to parse settings, using defaults");
                    Self::default()
                }
            },
            Err(err) => {
                tracing::debug!(%err, "no settings file yet, using defaults");
                Self::default()
            }
        }
    }

    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    pub fn origin_allowed(&self, origin: Option<&str>) -> bool {
        if self.allowed_origins.is_empty() {
            return true;
        }
        let Some(origin) = origin else {
            // No Origin header: browsers always send one for cross-origin WS,
            // a bare probe (or a non-browser client) may omit it.
            return true;
        };
        self.allowed_origins
            .iter()
            .any(|allowed| origin.starts_with(allowed))
    }
}
