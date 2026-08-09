use std::collections::{HashMap, VecDeque};
use std::time::Duration;

use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::config::AppSettings;
use crate::db::models::NewSession;

const DEFAULT_BASE_URL: &str = "http://127.0.0.1:8001";
const CLASSIFICATION_BATCH_SIZE: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub session_id: String,
    pub url: String,
    pub description: String,
    pub time_period: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionAiResult {
    pub session_id: String,
    pub category: String,
    pub bad_topic: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TimeFragment {
    pub duration_sec: f64,
    pub verdict: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHealthCheck {
    pub healthy: bool,
    pub message: String,
}

/// The public APIs always return a usable value. This flag lets callers update
/// observability without exposing an unavailable local AI service to the UI.
#[derive(Debug, Clone)]
pub struct ResilientResult<T> {
    pub value: T,
    pub used_fallback: bool,
}

#[derive(Debug)]
pub enum IntelligenceLayerError {
    Request(String),
    Response(String),
}

impl std::fmt::Display for IntelligenceLayerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Request(error) => write!(f, "Intelligence Layer request failed: {error}"),
            Self::Response(error) => write!(f, "Intelligence Layer response failed: {error}"),
        }
    }
}

impl std::error::Error for IntelligenceLayerError {}

#[derive(Clone)]
pub struct IntelligenceLayerClient {
    http: Client,
    base_url: String,
}

#[derive(Serialize)]
struct InferenceRequest<'a> {
    urls: Vec<&'a str>,
    descriptions: Vec<&'a str>,
    time_periods: Vec<&'a str>,
}

#[derive(Debug, Deserialize)]
struct InferenceResponse {
    sources: Vec<InferenceSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InferenceSource {
    url: String,
    #[serde(default)]
    #[allow(dead_code)]
    r#type: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    main_topic: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    summary: Option<String>,
    #[serde(default)]
    verdict: Option<String>,
}

#[derive(Serialize)]
struct BadTopicsRequest {
    outputs: Vec<InferenceSource>,
}

#[derive(Debug, Deserialize)]
struct BadTopicsResponse {
    results: Vec<BadTopicResponse>,
}

#[derive(Debug, Deserialize)]
struct BadTopicResponse {
    url: String,
    bad_topic: String,
}

#[derive(Serialize)]
struct FocusMetricsRequest {
    time_fragments: Vec<f64>,
    verdicts: Vec<String>,
}

#[derive(Deserialize)]
struct FocusMetricsResponse {
    mental_discipline_score: f64,
}

#[derive(Serialize)]
struct MonkSuggestionsRequest {
    bad_activities: Vec<String>,
}

#[derive(Deserialize)]
struct MonkSuggestionsResponse {
    suggestion_1: String,
    suggestion_2: String,
    suggestion_3: String,
    suggestion_4: String,
}

impl IntelligenceLayerClient {
    pub fn new(base_url: impl Into<String>, timeout_secs: u32) -> Self {
        let base_url = base_url.into();
        let base_url = if base_url.trim().is_empty() {
            DEFAULT_BASE_URL.to_string()
        } else {
            base_url.trim().trim_end_matches('/').to_string()
        };
        let timeout_secs = timeout_secs.max(1);
        let http = Client::builder()
            .timeout(Duration::from_secs(timeout_secs as u64))
            .connect_timeout(Duration::from_secs(timeout_secs.min(5) as u64))
            .build()
            .unwrap_or_else(|error| {
                tracing::error!(error = %error, "could not construct Intelligence Layer HTTP client");
                Client::new()
            });

        Self { http, base_url }
    }

    pub fn from_settings(settings: &AppSettings) -> Self {
        Self::new(
            settings.intelligence_layer_ai_base_url.clone(),
            settings.intelligence_layer_ai_timeout_secs,
        )
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }

    async fn post_json<Request, Response>(
        &self,
        path: &str,
        request: &Request,
    ) -> Result<Response, IntelligenceLayerError>
    where
        Request: Serialize + ?Sized,
        Response: DeserializeOwned,
    {
        let url = self.endpoint(path);
        let request_json = serde_json::to_value(request)
            .map_err(|error| IntelligenceLayerError::Request(error.to_string()))?;
        tracing::debug!(%url, request = ?request_json, "Intelligence Layer request");

        let response = self
            .http
            .post(&url)
            .json(request)
            .send()
            .await
            .map_err(|error| {
                tracing::error!(%url, error = %error, "Intelligence Layer request failed");
                IntelligenceLayerError::Request(error.to_string())
            })?;
        let status = response.status();
        let body = response.text().await.map_err(|error| {
            tracing::error!(%url, error = %error, "could not read Intelligence Layer response");
            IntelligenceLayerError::Response(error.to_string())
        })?;
        tracing::debug!(%url, status = %status, response = %body, "Intelligence Layer response");

        if !status.is_success() {
            let error = format!("HTTP {status}: {body}");
            tracing::error!(%url, %error, "Intelligence Layer returned an error response");
            return Err(IntelligenceLayerError::Response(error));
        }

        serde_json::from_str(&body).map_err(|error| {
            tracing::error!(%url, error = %error, response = %body, "Intelligence Layer returned invalid JSON");
            IntelligenceLayerError::Response(format!("invalid JSON: {error}"))
        })
    }

    /// Calls `/api/inference` in bounded batches and enriches its sources with
    /// `/api/bad-topics`. Individual failed batches use deterministic results
    /// so one unavailable model never leaves session rows unclassified.
    pub async fn classify_sessions_with_status(
        &self,
        sessions: Vec<SessionData>,
    ) -> ResilientResult<Vec<SessionAiResult>> {
        let mut results = Vec::with_capacity(sessions.len());
        let mut used_fallback = false;

        for batch in sessions.chunks(CLASSIFICATION_BATCH_SIZE) {
            let request = InferenceRequest {
                urls: batch.iter().map(|session| session.url.as_str()).collect(),
                descriptions: batch
                    .iter()
                    .map(|session| session.description.as_str())
                    .collect(),
                time_periods: batch
                    .iter()
                    .map(|session| session.time_period.as_str())
                    .collect(),
            };

            let inference = match self
                .post_json::<_, InferenceResponse>("/api/inference", &request)
                .await
            {
                Ok(response) => response,
                Err(error) => {
                    tracing::error!(
                        error = %error,
                        sessions = batch.len(),
                        "classification batch failed; using local category fallback"
                    );
                    used_fallback = true;
                    results.extend(batch.iter().map(fallback_classification));
                    continue;
                }
            };

            let mut topics = match self
                .post_json::<_, BadTopicsResponse>(
                    "/api/bad-topics",
                    &BadTopicsRequest {
                        outputs: inference.sources.clone(),
                    },
                )
                .await
            {
                Ok(response) => topics_by_url(response.results),
                Err(error) => {
                    tracing::error!(
                        error = %error,
                        sessions = batch.len(),
                        "bad-topic batch failed; using local bad-topic fallback"
                    );
                    used_fallback = true;
                    HashMap::new()
                }
            };

            let sources = inference.sources;
            let mut consumed = vec![false; sources.len()];
            for (index, session) in batch.iter().enumerate() {
                let source_index = sources
                    .iter()
                    .enumerate()
                    .find(|(source_index, source)| {
                        !consumed[*source_index] && source.url == session.url
                    })
                    .map(|(source_index, _)| source_index)
                    .or_else(|| (!consumed.get(index).copied().unwrap_or(true)).then_some(index));

                let Some(source_index) = source_index else {
                    tracing::error!(session_id = %session.session_id, "inference response omitted a session; using local fallback");
                    used_fallback = true;
                    results.push(fallback_classification(session));
                    continue;
                };

                consumed[source_index] = true;
                let source = &sources[source_index];
                let category = category_from_verdict(source.verdict.as_deref());
                // An explicit "None" from the model is meaningful and must
                // remain NULL; only a missing response uses the local map.
                let bad_topic = match topics.get_mut(&source.url).and_then(VecDeque::pop_front) {
                    Some(topic) => topic,
                    None => fallback_bad_topic_for_url(&session.url),
                };
                results.push(SessionAiResult {
                    session_id: session.session_id.clone(),
                    category,
                    bad_topic,
                });
            }
        }

        ResilientResult {
            value: results,
            used_fallback,
        }
    }

    pub async fn classify_sessions(&self, sessions: Vec<SessionData>) -> Vec<SessionAiResult> {
        self.classify_sessions_with_status(sessions).await.value
    }

    pub async fn get_mental_discipline_score_with_status(
        &self,
        sessions: Vec<TimeFragment>,
    ) -> ResilientResult<f64> {
        if sessions.is_empty() {
            return ResilientResult {
                value: 0.0,
                used_fallback: true,
            };
        }

        let request = FocusMetricsRequest {
            time_fragments: sessions
                .iter()
                .map(|fragment| fragment.duration_sec)
                .collect(),
            verdicts: sessions
                .iter()
                .map(|fragment| fragment.verdict.clone())
                .collect(),
        };
        match self
            .post_json::<_, FocusMetricsResponse>("/api/focus-metrics", &request)
            .await
        {
            Ok(response) if response.mental_discipline_score.is_finite() => ResilientResult {
                value: response.mental_discipline_score.clamp(0.0, 100.0),
                used_fallback: false,
            },
            Ok(_) => {
                tracing::error!("Intelligence Layer returned a non-finite mental discipline score");
                ResilientResult {
                    value: fallback_mental_discipline_score(&sessions),
                    used_fallback: true,
                }
            }
            Err(error) => {
                tracing::error!(error = %error, "focus-metrics failed; using local score fallback");
                ResilientResult {
                    value: fallback_mental_discipline_score(&sessions),
                    used_fallback: true,
                }
            }
        }
    }

    pub async fn get_mental_discipline_score(&self, sessions: Vec<TimeFragment>) -> f64 {
        self.get_mental_discipline_score_with_status(sessions)
            .await
            .value
    }

    pub async fn get_monk_suggestions_with_status(
        &self,
        bad_activities: Vec<String>,
    ) -> ResilientResult<Vec<String>> {
        if bad_activities.is_empty() {
            return ResilientResult {
                value: fallback_monk_suggestions(&[]),
                used_fallback: true,
            };
        }

        let request = MonkSuggestionsRequest {
            bad_activities: bad_activities.clone(),
        };
        match self
            .post_json::<_, MonkSuggestionsResponse>("/api/monk-suggestions", &request)
            .await
        {
            Ok(response) => {
                let suggestions = vec![
                    response.suggestion_1.trim().to_string(),
                    response.suggestion_2.trim().to_string(),
                    response.suggestion_3.trim().to_string(),
                    response.suggestion_4.trim().to_string(),
                ];
                if suggestions.iter().all(|suggestion| !suggestion.is_empty()) {
                    ResilientResult {
                        value: suggestions,
                        used_fallback: false,
                    }
                } else {
                    tracing::error!("Intelligence Layer returned an empty monk suggestion");
                    ResilientResult {
                        value: fallback_monk_suggestions(&bad_activities),
                        used_fallback: true,
                    }
                }
            }
            Err(error) => {
                tracing::error!(error = %error, "monk-suggestions failed; using local advice fallback");
                ResilientResult {
                    value: fallback_monk_suggestions(&bad_activities),
                    used_fallback: true,
                }
            }
        }
    }

    pub async fn get_monk_suggestions(&self, bad_activities: Vec<String>) -> Vec<String> {
        self.get_monk_suggestions_with_status(bad_activities)
            .await
            .value
    }

    pub async fn check_health(&self) -> AiHealthCheck {
        let url = self.endpoint("/health");
        tracing::debug!(%url, "Intelligence Layer health request");
        match self.http.get(&url).send().await {
            Ok(response) => {
                let status = response.status();
                let body = response.text().await.unwrap_or_else(|error| {
                    tracing::error!(%url, error = %error, "could not read Intelligence Layer health response");
                    String::new()
                });
                tracing::debug!(%url, status = %status, response = %body, "Intelligence Layer health response");
                if status.is_success() {
                    AiHealthCheck {
                        healthy: true,
                        message: if body.is_empty() {
                            format!("Intelligence Layer responded with HTTP {status}")
                        } else {
                            format!("Intelligence Layer ready: {body}")
                        },
                    }
                } else {
                    let message = format!("Intelligence Layer returned HTTP {status}: {body}");
                    tracing::error!(%url, %message, "Intelligence Layer health check failed");
                    AiHealthCheck {
                        healthy: false,
                        message,
                    }
                }
            }
            Err(error) => {
                tracing::error!(%url, error = %error, "Intelligence Layer health check failed");
                AiHealthCheck {
                    healthy: false,
                    message: error.to_string(),
                }
            }
        }
    }
}

pub fn session_data_from_session(session: &NewSession) -> SessionData {
    let url = if session.url.trim().is_empty() {
        session.hostname.clone()
    } else {
        session.url.clone()
    };
    SessionData {
        session_id: session.id.clone(),
        url,
        description: description_from_meta(session.meta.as_ref()),
        time_period: format_duration(session.duration_ms),
    }
}

pub fn infer_category_from_url(url: &str) -> String {
    let normalized = url.to_lowercase();
    let hostname = url::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_else(|| normalized.clone())
        .trim_start_matches("www.")
        .to_string();

    if let Some(category) = domain_category_map().get(hostname.as_str()) {
        return (*category).to_string();
    }

    if [
        "game", "gaming", "porn", "adult", "casino", "gambl", "betting", "slot",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
    {
        return "distracting".to_string();
    }
    if [
        "docs", "wiki", "learn", "course", "tutorial", "research", "code", "study",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
    {
        return "productive".to_string();
    }

    "neutral".to_string()
}

pub fn fallback_bad_topic_for_url(url: &str) -> Option<String> {
    let normalized = url.to_lowercase();
    let hostname = url::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_else(|| normalized.clone())
        .trim_start_matches("www.")
        .to_string();

    let topic = domain_bad_topic_map()
        .get(hostname.as_str())
        .copied()
        .or_else(|| {
            if ["steam", "epicgames", "roblox", "game"]
                .iter()
                .any(|word| normalized.contains(word))
            {
                Some("Gaming")
            } else if [
                "instagram",
                "facebook",
                "reddit",
                "tiktok",
                "twitter",
                "x.com",
                "social",
            ]
            .iter()
            .any(|word| normalized.contains(word))
            {
                Some("Social Media")
            } else if ["netflix", "twitch", "stream", "video"]
                .iter()
                .any(|word| normalized.contains(word))
            {
                Some("Streaming")
            } else if ["casino", "gambl", "betting", "slot"]
                .iter()
                .any(|word| normalized.contains(word))
            {
                Some("Gambling")
            } else if ["porn", "adult"]
                .iter()
                .any(|word| normalized.contains(word))
            {
                Some("Adult Content")
            } else if ["amazon", "ebay", "shop", "store"]
                .iter()
                .any(|word| normalized.contains(word))
            {
                Some("Shopping")
            } else {
                None
            }
        });
    topic.map(str::to_string)
}

pub fn verdict_from_category(category: Option<&str>) -> String {
    match category.unwrap_or("neutral").trim().to_lowercase().as_str() {
        "productive" | "deep_work" | "learning" | "research" | "coding" | "writing"
        | "planning" | "reading" | "analysis" => "Good".to_string(),
        "distracting" | "dopamine_shorts" | "social_media" | "gaming" | "streaming"
        | "entertainment" | "shopping" | "browsing" | "gambling" | "adult_content" => {
            "Bad".to_string()
        }
        _ => "Passive".to_string(),
    }
}

pub fn fallback_mental_discipline_score(sessions: &[TimeFragment]) -> f64 {
    if sessions.is_empty() {
        return 0.0;
    }

    let total_time: f64 = sessions
        .iter()
        .map(|fragment| fragment.duration_sec.max(0.0))
        .sum();
    if total_time <= 0.0 {
        return 0.0;
    }

    let mut good_time = 0.0;
    let mut passive_time = 0.0;
    for fragment in sessions {
        match fragment.verdict.trim().to_uppercase().as_str() {
            "GOOD" | "P" => good_time += fragment.duration_sec.max(0.0),
            "PASSIVE" | "N" => passive_time += fragment.duration_sec.max(0.0),
            _ => {}
        }
    }

    let active_focus = ((good_time + 0.5 * passive_time) / total_time) * 100.0;
    let total_hours = total_time / 3_600.0;
    let switches_per_hour = if total_hours > 0.0 {
        sessions.len().saturating_sub(1) as f64 / total_hours
    } else {
        0.0
    };
    let score = (active_focus - (switches_per_hour - 15.0).max(0.0)).clamp(0.0, 100.0);
    (score * 100.0).round() / 100.0
}

pub fn fallback_monk_suggestions(bad_activities: &[String]) -> Vec<String> {
    let primary = bad_activities
        .iter()
        .find(|activity| !activity.trim().is_empty())
        .map(|activity| normalize_activity(activity));
    monk_suggestions_map()
        .get(primary.as_deref().unwrap_or(""))
        .copied()
        .unwrap_or_else(|| monk_suggestions_map()["generic"])
        .iter()
        .map(|suggestion| (*suggestion).to_string())
        .collect()
}

fn fallback_classification(session: &SessionData) -> SessionAiResult {
    SessionAiResult {
        session_id: session.session_id.clone(),
        category: infer_category_from_url(&session.url),
        bad_topic: fallback_bad_topic_for_url(&session.url),
    }
}

fn category_from_verdict(verdict: Option<&str>) -> String {
    match verdict.unwrap_or_default().trim().to_lowercase().as_str() {
        "good" => "productive".to_string(),
        "bad" => "distracting".to_string(),
        "passive" => "neutral".to_string(),
        other => {
            tracing::error!(verdict = %other, "Intelligence Layer returned an unknown verdict; using neutral");
            "neutral".to_string()
        }
    }
}

fn topics_by_url(results: Vec<BadTopicResponse>) -> HashMap<String, VecDeque<Option<String>>> {
    let mut topics: HashMap<String, VecDeque<Option<String>>> = HashMap::new();
    for result in results {
        let topic = result.bad_topic.trim();
        let topic =
            (!topic.is_empty() && !topic.eq_ignore_ascii_case("none")).then(|| topic.to_string());
        topics.entry(result.url).or_default().push_back(topic);
    }
    topics
}

fn description_from_meta(meta: Option<&serde_json::Value>) -> String {
    let Some(meta) = meta else {
        return "Unknown page".to_string();
    };
    let Some(object) = meta.as_object() else {
        return "Unknown page".to_string();
    };

    let title = ["title", "pageTitle", "ogTitle"]
        .iter()
        .find_map(|key| object.get(*key).and_then(|value| value.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let description = ["description", "metaDescription", "ogDescription"]
        .iter()
        .find_map(|key| object.get(*key).and_then(|value| value.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty());

    match (title, description) {
        (Some(title), Some(description)) => format!("{title}. {description}"),
        (Some(value), None) | (None, Some(value)) => value.to_string(),
        (None, None) => "Unknown page".to_string(),
    }
}

fn format_duration(duration_ms: i64) -> String {
    let total_seconds = duration_ms.max(0) / 1_000;
    format!(
        "{} minutes {} seconds",
        total_seconds / 60,
        total_seconds % 60
    )
}

fn domain_category_map() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("youtube.com", "distracting"),
        ("youtu.be", "distracting"),
        ("github.com", "productive"),
        ("gitlab.com", "productive"),
        ("reddit.com", "distracting"),
        ("stackoverflow.com", "productive"),
        ("stackexchange.com", "productive"),
        ("netflix.com", "distracting"),
        ("instagram.com", "distracting"),
        ("facebook.com", "distracting"),
        ("tiktok.com", "distracting"),
        ("x.com", "distracting"),
        ("twitter.com", "distracting"),
        ("steamcommunity.com", "distracting"),
        ("store.steampowered.com", "distracting"),
        ("docs.rs", "productive"),
        ("wikipedia.org", "productive"),
        ("coursera.org", "productive"),
    ])
}

fn domain_bad_topic_map() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("youtube.com", "Streaming"),
        ("youtu.be", "Streaming"),
        ("reddit.com", "Social Media"),
        ("instagram.com", "Social Media"),
        ("facebook.com", "Social Media"),
        ("tiktok.com", "Social Media"),
        ("x.com", "Social Media"),
        ("twitter.com", "Social Media"),
        ("netflix.com", "Streaming"),
        ("twitch.tv", "Streaming"),
        ("steamcommunity.com", "Gaming"),
        ("store.steampowered.com", "Gaming"),
        ("amazon.com", "Shopping"),
        ("ebay.com", "Shopping"),
    ])
}

fn normalize_activity(activity: &str) -> String {
    activity
        .trim()
        .to_lowercase()
        .replace('_', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn monk_suggestions_map() -> HashMap<&'static str, [&'static str; 4]> {
    HashMap::from([
        (
            "social media",
            [
                "Delete the app from your phone.",
                "Set a timer for 5 minutes.",
                "Replace the habit with reading a sutra.",
                "Meditate for 2 minutes before opening.",
            ],
        ),
        (
            "gaming",
            [
                "Limit yourself to one match per day.",
                "Reflect: is this helping my long-term happiness?",
                "Spend that time on a real-world skill.",
                "Practice the 'Digital Detox' meditation.",
            ],
        ),
        (
            "streaming",
            [
                "Pause the stream and take three deep breaths.",
                "Choose one episode or video before pressing play.",
                "Return to one small task when the timer ends.",
                "Take a short walk before opening another stream.",
            ],
        ),
        (
            "gambling",
            [
                "Close the site and step away from the screen.",
                "Tell a trusted person about the urge.",
                "Block gambling sites for the rest of the day.",
                "Take a five-minute walk before making any decision.",
            ],
        ),
        (
            "adult content",
            [
                "Close the tab and place the device out of reach.",
                "Observe the urge with five slow breaths.",
                "Move your body with a walk, water, or stretches.",
                "Write one honest line about the feeling beneath the urge.",
            ],
        ),
        (
            "shopping",
            [
                "Close the cart and wait three days before buying.",
                "Ask what need this purchase is trying to fill.",
                "Write the item on a list instead of checking out.",
                "Take a short walk before reopening the store.",
            ],
        ),
        (
            "generic",
            [
                "Take three deep breaths.",
                "Ask yourself: what did I intend to do?",
                "Write down one thing you are grateful for.",
                "Go for a short walk.",
            ],
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    async fn start_contract_server(responses: Vec<String>) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind contract server");
        let address = listener.local_addr().expect("contract server address");
        tokio::spawn(async move {
            for body in responses {
                let (mut stream, _) = listener.accept().await.expect("accept request");
                let mut request = [0_u8; 8_192];
                stream.read(&mut request).await.expect("read request");
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                stream
                    .write_all(response.as_bytes())
                    .await
                    .expect("write response");
            }
        });
        format!("http://{address}")
    }

    #[test]
    fn fallback_category_covers_domains_and_keywords() {
        assert_eq!(
            infer_category_from_url("https://github.com/org/repo"),
            "productive"
        );
        assert_eq!(
            infer_category_from_url("https://reddit.com/r/rust"),
            "distracting"
        );
        assert_eq!(
            infer_category_from_url("https://example.com/docs/start"),
            "productive"
        );
        assert_eq!(
            infer_category_from_url("https://example.com/casino"),
            "distracting"
        );
        assert_eq!(infer_category_from_url("https://example.com/"), "neutral");
    }

    #[test]
    fn fallback_score_matches_focus_metrics_formula() {
        let sessions = vec![
            TimeFragment {
                duration_sec: 1_800.0,
                verdict: "Good".into(),
            },
            TimeFragment {
                duration_sec: 1_800.0,
                verdict: "Passive".into(),
            },
        ];
        assert_eq!(fallback_mental_discipline_score(&sessions), 75.0);
    }

    #[test]
    fn fallback_monk_advice_always_has_four_steps() {
        let suggestions = fallback_monk_suggestions(&["Social Media".into()]);
        assert_eq!(suggestions.len(), 4);
        assert!(suggestions[0].contains("Delete"));
    }

    #[test]
    fn session_data_uses_metadata_and_duration() {
        let session = NewSession {
            id: "session".into(),
            client_id: "client".into(),
            browser_type: "chrome".into(),
            url: "https://example.com".into(),
            hostname: "example.com".into(),
            pathname: "/".into(),
            meta: Some(serde_json::json!({ "title": "Example", "description": "A page" })),
            duration_ms: 61_000,
            started_at: 0,
            ended_at: 61_000,
            matched_rules: vec![],
            primary_rule_id: None,
            tab_id: 0,
            aggregated_from: Some(1),
            category: String::new(),
        };
        let data = session_data_from_session(&session);
        assert_eq!(data.description, "Example. A page");
        assert_eq!(data.time_period, "1 minutes 1 seconds");
    }

    #[tokio::test]
    async fn classification_uses_the_inference_and_bad_topics_contract() {
        let base_url = start_contract_server(vec![
            serde_json::json!({
                "sources": [
                    {
                        "url": "https://docs.example.test/guide",
                        "type": "documentation",
                        "main_topic": "Rust",
                        "summary": "A guide",
                        "verdict": "Good"
                    },
                    {
                        "url": "https://play.example.test/game",
                        "type": "other",
                        "main_topic": "A game",
                        "summary": "A game page",
                        "verdict": "Bad"
                    }
                ]
            })
            .to_string(),
            serde_json::json!({
                "results": [
                    { "url": "https://docs.example.test/guide", "bad_topic": "None" },
                    { "url": "https://play.example.test/game", "bad_topic": "Gaming" }
                ]
            })
            .to_string(),
        ])
        .await;
        let client = IntelligenceLayerClient::new(base_url, 1);
        let outcome = client
            .classify_sessions_with_status(vec![
                SessionData {
                    session_id: "good".into(),
                    url: "https://docs.example.test/guide".into(),
                    description: "Unknown page".into(),
                    time_period: "1 minutes 0 seconds".into(),
                },
                SessionData {
                    session_id: "bad".into(),
                    url: "https://play.example.test/game".into(),
                    description: "Unknown page".into(),
                    time_period: "1 minutes 0 seconds".into(),
                },
            ])
            .await;

        assert!(!outcome.used_fallback);
        assert_eq!(outcome.value[0].category, "productive");
        assert_eq!(outcome.value[0].bad_topic, None);
        assert_eq!(outcome.value[1].category, "distracting");
        assert_eq!(outcome.value[1].bad_topic.as_deref(), Some("Gaming"));
    }
}
