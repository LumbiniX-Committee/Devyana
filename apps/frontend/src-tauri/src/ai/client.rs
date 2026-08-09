use std::time::Duration;

use reqwest::Client;

use crate::config::AppSettings;
use crate::db::models::{NewSession, UserProfile};
use crate::state::AppState;

#[derive(Debug)]
pub enum AiError {
    NotConfigured,
    Request(String),
}

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiError::NotConfigured => write!(f, "AI endpoint is not configured"),
            AiError::Request(e) => write!(f, "AI request failed: {e}"),
        }
    }
}

impl std::error::Error for AiError {}

pub struct AiClient {
    pub(crate) http: Client,
}

impl Clone for AiClient {
    fn clone(&self) -> Self {
        Self {
            http: self.http.clone(),
        }
    }
}

impl AiClient {
    pub fn new() -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default();

        Self { http }
    }
}

impl Default for AiClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Tries `send` once, then one more time on transient failure.
async fn with_retry<F, Fut, T>(send: F) -> Result<T, AiError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, AiError>>,
{
    match send().await {
        Ok(value) => Ok(value),
        Err(first) => match send().await {
            Ok(value) => Ok(value),
            Err(_) => Err(first),
        },
    }
}

fn ensure_configured(_settings: &AppSettings, url: &str) -> Result<(), AiError> {
    if url.trim().is_empty() {
        return Err(AiError::NotConfigured);
    }
    Ok(())
}

/// POSTs a JSON body to `url` and returns the parsed response.
async fn post_json(
    client: &Client,
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, AiError> {
    let mut request = client.post(url).json(body);
    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key.trim()));
    }

    let resp = request
        .send()
        .await
        .map_err(|e| AiError::Request(e.to_string()))?;

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AiError::Request(e.to_string()))?;

    serde_json::from_slice(&bytes).map_err(|e| AiError::Request(format!("invalid JSON: {e}")))
}

/// Classifies a page into a category string (e.g. "youtube_educational").
pub async fn classify_page(
    client: &Client,
    settings: &AppSettings,
    url: &str,
    hostname: &str,
    pathname: &str,
    meta: &serde_json::Value,
    recent_sessions: &[serde_json::Value],
) -> Result<String, AiError> {
    ensure_configured(settings, &settings.ai_classify_url)?;

    let body = serde_json::json!({
        "url": url,
        "hostname": hostname,
        "pathname": pathname,
        "meta": meta,
        "recentSessions": recent_sessions,
    });

    let value = with_retry(|| post_json(client, &settings.ai_classify_url, &settings.ai_api_key, &body)).await?;

    if let Some(category) = value.get("category").and_then(|c| c.as_str()) {
        return Ok(category.to_string());
    }
    if let Some(category) = value.as_str() {
        return Ok(category.to_string());
    }

    tracing::warn!(response = ?value, "classify returned no category");
    Ok(String::new())
}

/// Sends a batch of unprocessed sessions and returns the updated behavior graph.
pub async fn update_behavior_graph(
    client: &Client,
    settings: &AppSettings,
    user_id: &str,
    sessions_batch: &[serde_json::Value],
) -> Result<serde_json::Value, AiError> {
    ensure_configured(settings, &settings.ai_graph_url)?;

    let body = serde_json::json!({
        "userId": user_id,
        "sessions": sessions_batch,
    });

    with_retry(|| post_json(client, &settings.ai_graph_url, &settings.ai_api_key, &body)).await
}

/// Typed variant used by the batcher: accepts `Vec<SessionForAI>` (already
/// compressed/sanitized on the server side) and serializes on the way out.
pub async fn update_behavior_graph_sessions(
    client: &Client,
    settings: &AppSettings,
    user_id: &str,
    sessions_batch: &[crate::models::analytics::SessionForAI],
) -> Result<serde_json::Value, AiError> {
    let payload: Vec<serde_json::Value> = sessions_batch
        .iter()
        .map(|s| serde_json::to_value(s).unwrap_or_else(|_| serde_json::json!({})))
        .collect();
    update_behavior_graph(client, settings, user_id, &payload).await
}

/// Initializes the behavior graph from an onboarding profile.
pub async fn initialize_behavior_graph(
    client: &Client,
    settings: &AppSettings,
    profile: &UserProfile,
) -> Result<serde_json::Value, AiError> {
    ensure_configured(settings, &settings.ai_init_url)?;

    let goals = serde_json::from_str::<serde_json::Value>(&profile.goals)
        .unwrap_or_else(|_| serde_json::json!([]));

    let body = serde_json::json!({
        "userId": profile.id,
        "gender": profile.gender,
        "age": profile.age,
        "profession": profile.profession,
        "goals": goals,
    });

    with_retry(|| post_json(client, &settings.ai_init_url, &settings.ai_api_key, &body)).await
}

/// Convenience wrapper used by the event loop: classifies a recorded session.
pub async fn classify_session(
    state: &AppState,
    session: &NewSession,
) -> Result<String, AiError> {
    let settings = state.settings();
    let meta = session.meta.clone().unwrap_or_else(|| serde_json::json!({}));
    let recent = crate::db::queries::recent_session_context(&state.db, 12).await;

    classify_page(
        &state.ai.http,
        &settings,
        &session.url,
        &session.hostname,
        &session.pathname,
        &meta,
        &recent,
    )
    .await
}

/// Asks the Intelligence Layer for personalised task suggestions given the
/// profile, the current behavior graph and the 10 most recent uncompleted
/// tasks. The response must be a JSON object whose `suggestions` field (or
/// root value) is an array of `{ title, description, reason }` items — the
/// caller is responsible for parsing and falling back gracefully.
pub async fn suggest_tasks(
    client: &Client,
    settings: &AppSettings,
    profile: &UserProfile,
    behavior_graph: Option<&serde_json::Value>,
    existing_tasks: &[serde_json::Value],
) -> Result<serde_json::Value, AiError> {
    ensure_configured(settings, &settings.ai_suggest_url)?;

    let goals = serde_json::from_str::<serde_json::Value>(&profile.goals)
        .unwrap_or_else(|_| serde_json::json!([]));

    let body = serde_json::json!({
        "profile": {
            "userId": profile.id,
            "gender": profile.gender,
            "age": profile.age,
            "profession": profile.profession,
            "goals": goals,
        },
        "behaviorGraph": behavior_graph.unwrap_or(&serde_json::json!(null)),
        "context": existing_tasks,
    });

    with_retry(|| post_json(client, &settings.ai_suggest_url, &settings.ai_api_key, &body)).await
}