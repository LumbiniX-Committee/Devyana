use std::net::SocketAddr;

use tauri::Emitter;
use tokio::net::TcpListener;

use crate::state::AppState;

pub const PORT_RANGE_START: u16 = 7423;
pub const PORT_RANGE_END: u16 = 7433;

/// Binds a loopback listener on the first free port in `7423..=7433`.
async fn bind_listener() -> Result<(TcpListener, u16), String> {
    for port in PORT_RANGE_START..=PORT_RANGE_END {
        let addr = SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST), port);
        match TcpListener::bind(addr).await {
            Ok(listener) => return Ok((listener, port)),
            Err(err) => {
                tracing::debug!(%port, error = %err, "port busy, trying next");
            }
        }
    }
    Err(format!(
        "no free port in {PORT_RANGE_START}..={PORT_RANGE_END}"
    ))
}

/// Starts the WebSocket server. Runs for the lifetime of the app process;
/// emits a `viyana_ws_port` Tauri event once the port is chosen.
pub async fn run(state: AppState) {
    let (listener, port) = match bind_listener().await {
        Ok(pair) => pair,
        Err(err) => {
            tracing::error!(error = %err, "websocket server could not start");
            return;
        }
    };

    tracing::info!(port, "websocket server listening on 127.0.0.1");
    let _ = state.app.emit("viyana_ws_port", port);

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                let state = state.clone();
                tauri::async_runtime::spawn(async move {
                    super::handler::handle_connection(state, stream, peer).await;
                });
            }
            Err(err) => {
                tracing::warn!(error = %err, "failed to accept connection");
            }
        }
    }
}
