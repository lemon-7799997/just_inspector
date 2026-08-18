//! WebSocket server thread for the Bevy example.
//!
//! Runs a tokio runtime on a dedicated thread and speaks the Just Inspector
//! JSON protocol (docs/protocol.md). It never touches the ECS: commands are
//! forwarded to the Bevy main thread (crossbeam channel + oneshot replies) and
//! runtime events are broadcast back (tokio broadcast channel).

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use crossbeam_channel::Sender;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message as WsMessage;

/// Commands the server thread sends to the Bevy main thread.
pub enum InspectorCommand {
    Hello { reply: tokio::sync::oneshot::Sender<Value> },
    Ping { reply: tokio::sync::oneshot::Sender<Value> },
    Attach { reply: tokio::sync::oneshot::Sender<Value> },
    Detach { reply: tokio::sync::oneshot::Sender<Value> },
    GetTree { reply: tokio::sync::oneshot::Sender<Value> },
    GetNode { id: String, reply: tokio::sync::oneshot::Sender<Value> },
    SetValue { id: String, property: String, value: Value, reply: tokio::sync::oneshot::Sender<Value> },
}

/// Kept alive for the whole app lifetime; dropping it shuts the server down.
pub struct InspectorServerHandle {
    shutdown: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl Drop for InspectorServerHandle {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.shutdown.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(());
            }
        }
    }
}

pub fn game_info() -> Value {
    json!({
        "gameName": "Bevy Demo",
        "engine": "bevy",
        "engineVersion": env!("CARGO_PKG_VERSION"),
        "protocolVersion": "1.0",
        "capabilities": ["live-values"],
    })
}

pub fn spawn_inspector_server(
    port: u16,
    command_tx: Sender<InspectorCommand>,
    event_tx: tokio::sync::broadcast::Sender<Value>,
) -> InspectorServerHandle {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let shutdown = Arc::new(Mutex::new(Some(shutdown_tx)));

    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("failed to build tokio runtime");
        runtime.block_on(async move {
            let listener = match TcpListener::bind(("127.0.0.1", port)).await {
                Ok(l) => l,
                Err(err) => {
                    eprintln!("Just Inspector (bevy): failed to bind {port}: {err}");
                    return;
                }
            };
            println!("Just Inspector (bevy): listening on ws://127.0.0.1:{port}");

            let mut shutdown_rx = shutdown_rx;
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => break,
                    accepted = listener.accept() => {
                        if let Ok((stream, addr)) = accepted {
                            tokio::spawn(handle_client(stream, addr, command_tx.clone(), event_tx.clone()));
                        }
                    }
                }
            }
        });
    });

    InspectorServerHandle { shutdown }
}

async fn handle_client(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    command_tx: Sender<InspectorCommand>,
    event_tx: tokio::sync::broadcast::Sender<Value>,
) {
    let ws = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(_) => return,
    };
    println!("Just Inspector (bevy): client connected from {addr}");

    let (mut sink, mut source) = ws.split();

    // Greet the client with the game identity.
    if sink
        .send(WsMessage::Text(json!({"method": "Inspector.ready", "params": game_info()}).to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    let mut events = event_tx.subscribe();
    loop {
        tokio::select! {
            incoming = source.next() => {
                match incoming {
                    Some(Ok(WsMessage::Text(text))) => {
                        if !handle_frame(&text, &command_tx, &mut sink).await {
                            break;
                        }
                    }
                    Some(Ok(WsMessage::Binary(bytes))) => {
                        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                            if !handle_frame(&text, &command_tx, &mut sink).await {
                                break;
                            }
                        }
                    }
                    Some(Ok(WsMessage::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            event = events.recv() => {
                if let Ok(value) = event {
                    if sink
                        .send(WsMessage::Text(value.to_string().into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
    }
    println!("Just Inspector (bevy): client {addr} disconnected");
}

/// Returns false when the connection should be closed.
async fn handle_frame(
    text: &str,
    command_tx: &Sender<InspectorCommand>,
    sink: &mut futures_util::stream::SplitSink<tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>, WsMessage>,
) -> bool {
    let frame: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => {
            let _ = sink
                .send(WsMessage::Text(
                    json!({"id": -1, "error": {"code": -32700, "message": "Parse error"}}).to_string().into(),
                ))
                .await;
            return true;
        }
    };
    let Some(id) = frame["id"].as_u64() else {
        return true;
    };
    let method = frame["method"].as_str().unwrap_or("");
    let params = &frame["params"];

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel::<Value>();
    let command = match method {
        "Inspector.hello" => Some(InspectorCommand::Hello { reply: reply_tx }),
        "Inspector.ping" => Some(InspectorCommand::Ping { reply: reply_tx }),
        "Inspector.attach" => Some(InspectorCommand::Attach { reply: reply_tx }),
        "Inspector.detach" => Some(InspectorCommand::Detach { reply: reply_tx }),
        "Runtime.getTree" => Some(InspectorCommand::GetTree { reply: reply_tx }),
        "Runtime.getNode" => Some(InspectorCommand::GetNode {
            id: params["nodeId"].as_str().unwrap_or("").to_string(),
            reply: reply_tx,
        }),
        "Runtime.setValue" => Some(InspectorCommand::SetValue {
            id: params["nodeId"].as_str().unwrap_or("").to_string(),
            property: params["property"].as_str().unwrap_or("").to_string(),
            value: params["value"].clone(),
            reply: reply_tx,
        }),
        _ => {
            let _ = sink
                .send(WsMessage::Text(
                    json!({"id": id, "error": {"code": -32601, "message": format!("Method not found: {method}")}})
                        .to_string()
                        .into(),
                ))
                .await;
            return true;
        }
    };

    if let Some(command) = command {
        if command_tx.send(command).is_err() {
            return false;
        }
        // Wait for the Bevy main thread to answer (it ticks at least every frame).
        match tokio::time::timeout(std::time::Duration::from_secs(2), reply_rx).await {
            Ok(Ok(payload)) => {
                let response = if payload.get("error").is_some() {
                    json!({ "id": id, "error": payload["error"] })
                } else {
                    json!({ "id": id, "result": payload })
                };
                if sink.send(WsMessage::Text(response.to_string().into())).await.is_err() {
                    return false;
                }
            }
            _ => {
                let _ = sink
                    .send(WsMessage::Text(
                        json!({"id": id, "error": {"code": -32603, "message": "Timeout waiting for game"}})
                            .to_string()
                            .into(),
                    ))
                    .await;
            }
        }
    }
    true
}
