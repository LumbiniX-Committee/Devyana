use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

/// Maps `client_id` -> outbound channel of the open WebSocket connection.
/// Used to push `DesktopCommand`s back to the extension.
#[derive(Debug, Default)]
pub struct WsRegistry {
    clients: Mutex<HashMap<String, mpsc::Sender<Message>>>,
}

impl WsRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, client_id: String, tx: mpsc::Sender<Message>) {
        self.clients
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(client_id, tx);
    }

    pub fn remove(&self, client_id: &str) {
        self.clients
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(client_id);
    }

    pub fn contains(&self, client_id: &str) -> bool {
        self.clients
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(client_id)
    }

    /// Attempts to deliver `msg` to the given client. Returns `Ok(())` when a
    /// live connection took it, `Err(())` when the client is offline.
    pub async fn send(&self, client_id: &str, msg: Message) -> Result<(), ()> {
        // Clone the sender while holding the lock only for the map lookup.
        let sender = self
            .clients
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(client_id)
            .cloned();

        let Some(sender) = sender else {
            return Err(());
        };

        match sender.send(msg).await {
            Ok(()) => Ok(()),
            Err(_) => {
                // Channel closed underneath us: prune the stale entry.
                self.remove(client_id);
                Err(())
            }
        }
    }
}

pub type SharedRegistry = Arc<WsRegistry>;