use serde::de::Error as _;
use serde::{Deserialize, Deserializer};

/// Mirrors `SessionEndEvent` from `packages/behavior-core/src/events`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEndEvent {
    pub client_id: String,
    pub browser_type: String,
    #[serde(default)]
    pub rule_ids: Vec<String>,
    #[serde(default)]
    pub primary_rule_id: Option<String>,
    #[serde(default)]
    pub category: String,
    pub url: String,
    pub hostname: String,
    pub pathname: String,
    #[serde(default)]
    pub meta: serde_json::Value,
    pub started_at: i64,
    pub end_at: i64,
    pub duration_ms: i64,
    pub tab_id: i64,
    #[serde(default)]
    pub aggregated_from: Option<i64>,
}

/// Event envelope: `{ entryId } & VinayaEvent`.
#[derive(Debug, Clone)]
pub struct EventEnvelope {
    pub entry_id: String,
    pub event: VinayaEvent,
}

impl<'de> Deserialize<'de> for EventEnvelope {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let value = serde_json::Value::deserialize(d)?;
        let entry_id = value
            .get("entryId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| D::Error::custom("missing entryId"))?
            .to_string();

        let mut rest = value;
        if let Some(obj) = rest.as_object_mut() {
            obj.remove("entryId");
        }

        let event = serde_json::from_value(rest).map_err(D::Error::custom)?;

        Ok(EventEnvelope { entry_id, event })
    }
}

/// Typed behavioral events discriminated by the `event` field.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum VinayaEvent {
    #[serde(rename_all = "camelCase")]
    SessionEnd(SessionEndEvent),
    #[serde(rename_all = "camelCase")]
    FocusLost,
    #[serde(rename_all = "camelCase")]
    FocusGained,
    #[serde(rename_all = "camelCase")]
    PageMetaScanned {
        url: String,
        #[serde(default)]
        meta: serde_json::Value,
    },
    #[serde(rename_all = "camelCase")]
    RuleViolation {
        #[serde(default)]
        rule_id: Option<String>,
        #[serde(default)]
        url: Option<String>,
        #[serde(default)]
        message: Option<String>,
        #[serde(default)]
        meta: Option<serde_json::Value>,
    },
    #[serde(rename_all = "camelCase")]
    SystemEvent {
        name: String,
        #[serde(default)]
        message: Option<String>,
        #[serde(default)]
        data: Option<serde_json::Value>,
    },
}

/// Mirrors `HandshakeMessage` from `packages/behavior-core`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandshakeMessage {
    pub r#type: String,
    pub client_id: String,
    pub browser_type: String,
    #[serde(default)]
    pub extension_version: String,
}

#[derive(Debug)]
pub enum ClientMessage {
    Handshake(HandshakeMessage),
    Event(EventEnvelope),
}

impl ClientMessage {
    pub fn parse(raw: &str) -> Result<Self, serde_json::Error> {
        let value: serde_json::Value = serde_json::from_str(raw)?;

        if value.get("type").and_then(|v| v.as_str()) == Some("handshake") {
            serde_json::from_value(value).map(ClientMessage::Handshake)
        } else if value.get("event").is_some() {
            serde_json::from_value(value).map(ClientMessage::Event)
        } else {
            Err(serde::de::Error::custom("unknown client message"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_session_end_envelope() {
        let raw = r#"{
            "entryId": "abc-123",
            "event": "session_end",
            "clientId": "cli-1",
            "browserType": "chrome",
            "ruleIds": ["youtube"],
            "primaryRuleId": "youtube",
            "category": "",
            "url": "https://www.youtube.com/watch?v=x",
            "hostname": "youtube.com",
            "pathname": "/watch",
            "meta": { "title": "wow" },
            "startedAt": 1,
            "endAt": 2,
            "durationMs": 1000,
            "tabId": 7,
            "aggregatedFrom": 3
        }"#;

        let msg = ClientMessage::parse(raw).expect("parses");
        match msg {
            ClientMessage::Event(env) => {
                assert_eq!(env.entry_id, "abc-123");
                match env.event {
                    VinayaEvent::SessionEnd(s) => {
                        assert_eq!(s.client_id, "cli-1");
                        assert_eq!(s.duration_ms, 1000);
                        assert_eq!(s.tab_id, 7);
                        assert_eq!(s.aggregated_from, Some(3));
                    }
                    other => panic!("wrong variant: {other:?}"),
                }
            }
            ClientMessage::Handshake(_) => panic!("expected event"),
        }
    }

    #[test]
    fn parses_handshake() {
        let raw = r#"{"type":"handshake","clientId":"c1","browserType":"edge","extensionVersion":"1.2.3"}"#;
        let msg = ClientMessage::parse(raw).expect("parses");
        match msg {
            ClientMessage::Handshake(h) => {
                assert_eq!(h.client_id, "c1");
                assert_eq!(h.browser_type, "edge");
            }
            _ => panic!("expected handshake"),
        }
    }
}