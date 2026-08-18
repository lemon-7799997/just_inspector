//! Just Inspector — Bevy example.
//!
//! A headless Bevy app that simulates a small scene graph and exposes it to
//! the Just Inspector UI over WebSocket (protocol: docs/protocol.md).
//!
//! How it is wired:
//!   * `inspector.rs` runs a dedicated server thread (tokio + tokio-tungstenite)
//!     listening on ws://127.0.0.1:8765.
//!   * The server thread never touches the ECS. It forwards protocol commands
//!     to the Bevy main thread through a crossbeam channel and receives replies
//!     on tokio oneshot channels; runtime events flow back through a tokio
//!     broadcast channel.
//!   * `InspectorState` holds the demo "entities" as plain data. In a real
//!     project you would instead query your components (`world.query::<&Name,
//!     &Transform>()` ...) when answering GetNode/GetTree and read/write
//!     component values in SetValue.
//!
//! Run with:  cargo run
//! Then open the inspector UI (browser build or VS Code extension) and connect
//! to ws://127.0.0.1:8765.

mod inspector;

use bevy::app::{App, Startup, Update};
use bevy::prelude::{Commands, ResMut, Resource};
use bevy::MinimalPlugins;
use inspector::{InspectorCommand, InspectorServerHandle, spawn_inspector_server};
use serde_json::Value;

/// One inspectable "entity". Mirrors what you would extract from components
/// (Transform, Health, Name, ...) in a real integration.
#[derive(Clone, Debug)]
pub struct DemoEntity {
    pub id: u64,
    pub name: String,
    pub kind: String,
    pub path: String,
    pub position: [f32; 3],
    pub health: i64,
    pub alive: bool,
    pub speed: f64,
    pub color: [f64; 4],
    pub team: String,
    pub fov: f64,
    pub intensity: f64,
}

#[derive(Resource)]
pub struct InspectorState {
    pub entities: Vec<DemoEntity>,
    pub frame: u64,
    pub command_rx: crossbeam_channel::Receiver<InspectorCommand>,
    pub event_tx: tokio::sync::broadcast::Sender<Value>,
    _server: InspectorServerHandle,
}

fn main() {
    App::new()
        .add_plugins(MinimalPlugins)
        .add_systems(Startup, setup_inspector)
        .add_systems(Update, (simulate_world, pump_inspector))
        .run();
}

fn setup_inspector(mut commands: Commands) {
    let port = std::env::var("JI_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8765);
    let (command_tx, command_rx) = crossbeam_channel::unbounded::<InspectorCommand>();
    let (event_tx, _) = tokio::sync::broadcast::channel::<Value>(64);
    let server = spawn_inspector_server(port, command_tx, event_tx.clone());

    let entities = vec![
        DemoEntity {
            id: 1,
            name: "Player".into(),
            kind: "Character".into(),
            path: "/world/player".into(),
            position: [1.5, 0.2, -3.0],
            health: 80,
            alive: true,
            speed: 5.2,
            color: [0.85, 0.25, 0.25, 1.0],
            team: "red".into(),
            fov: 0.0,
            intensity: 0.0,
        },
        DemoEntity {
            id: 2,
            name: "Camera".into(),
            kind: "Camera".into(),
            path: "/world/camera".into(),
            position: [0.0, 2.0, 5.0],
            health: 0,
            alive: true,
            speed: 0.0,
            color: [0.0, 0.0, 0.0, 1.0],
            team: "none".into(),
            fov: 70.0,
            intensity: 0.0,
        },
        DemoEntity {
            id: 3,
            name: "Sun".into(),
            kind: "DirectionalLight".into(),
            path: "/world/sun".into(),
            position: [0.0, 10.0, 0.0],
            health: 0,
            alive: true,
            speed: 0.0,
            color: [1.0, 0.95, 0.8, 1.0],
            team: "none".into(),
            fov: 0.0,
            intensity: 1.0,
        },
    ];

    commands.insert_resource(InspectorState {
        entities,
        frame: 0,
        command_rx,
        event_tx,
        _server: server,
    });
    println!("Just Inspector (bevy example): listening on ws://127.0.0.1:{port}");
}

/// Simulate the game mutating values, and push Runtime.nodeChanged events.
fn simulate_world(mut state: ResMut<InspectorState>) {
    state.frame += 1;
    let frame = state.frame;
    let mut changed: Vec<(String, &'static str)> = Vec::new();

    if let Some(player) = state.entities.iter_mut().find(|e| e.name == "Player") {
        player.position[0] += (frame as f32 * 0.01).sin() * 0.02;
        changed.push(("Player".to_string(), "position"));
        if frame % 90 == 0 {
            player.health = (player.health - 1).max(0);
            changed.push(("Player".to_string(), "health"));
        }
    }

    if frame % 240 == 0 {
        let intensity = 0.8 + ((frame / 240) % 10) as f64 * 0.05;
        if let Some(light) = state.entities.iter_mut().find(|e| e.name == "Sun") {
            light.intensity = intensity;
            changed.push(("Sun".to_string(), "intensity"));
        }
    }

    for (name, property) in changed {
        if let Some(entity) = state.entities.iter().find(|e| e.name == name) {
            let _ = state.event_tx.send(serde_json::json!({
                "method": "Runtime.nodeChanged",
                "params": { "nodeId": entity.id.to_string(), "property": property },
            }));
        }
    }
}

/// Answer protocol commands from the server thread.
fn pump_inspector(mut state: ResMut<InspectorState>) {
    while let Ok(command) = state.command_rx.try_recv() {
        match command {
            InspectorCommand::Hello { reply } => {
                let _ = reply.send(inspector::game_info());
            }
            InspectorCommand::Ping { reply } => {
                let _ = reply.send(serde_json::json!({ "pong": "pong" }));
            }
            InspectorCommand::Attach { reply } => {
                let _ = reply.send(serde_json::json!({ "sessionId": "bevy-1" }));
            }
            InspectorCommand::Detach { reply } => {
                let _ = reply.send(serde_json::json!({ "ok": true }));
            }
            InspectorCommand::GetTree { reply } => {
                let _ = reply.send(serde_json::json!({ "root": tree_json(&state.entities) }));
            }
            InspectorCommand::GetNode { id, reply } => {
                let node = state.entities.iter().find(|e| e.id.to_string() == id);
                match node {
                    Some(entity) => {
                        let _ = reply.send(serde_json::json!({ "node": node_json(entity) }));
                    }
                    None => {
                        let _ = reply.send(serde_json::json!({
                            "error": { "code": 4100, "message": format!("Unknown node: {id}") }
                        }));
                    }
                }
            }
            InspectorCommand::SetValue { id, property, value, reply } => {
                let result = apply_value(&mut state.entities, &id, &property, &value);
                let _ = reply.send(result);
            }
        }
    }
}

/* ------------------------- protocol serialization ------------------------ */

fn tree_json(entities: &[DemoEntity]) -> serde_json::Value {
    let children: Vec<serde_json::Value> = entities
        .iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id.to_string(),
                "name": e.name,
                "kind": e.kind,
            })
        })
        .collect();
    serde_json::json!({
        "id": "world".to_string(),
        "name": "World".to_string(),
        "kind": "World".to_string(),
        "children": children,
    })
}

fn node_json(e: &DemoEntity) -> serde_json::Value {
    serde_json::json!({
        "id": e.id.to_string(),
        "name": e.name,
        "kind": e.kind,
        "path": e.path,
        "properties": [
            { "name": "name", "value": {"type": "string", "value": e.name} },
            { "name": "position", "control": "vector", "value": {"type": "vec3", "x": e.position[0], "y": e.position[1], "z": e.position[2]} },
            { "name": "health", "control": "slider", "hint": {"min": 0, "max": 100, "step": 1}, "value": {"type": "int", "value": e.health} },
            { "name": "alive", "value": {"type": "bool", "value": e.alive} },
            { "name": "speed", "control": "slider", "hint": {"min": 0, "max": 20, "step": 0.1}, "value": {"type": "float", "value": e.speed} },
            { "name": "color", "value": {"type": "color", "r": e.color[0], "g": e.color[1], "b": e.color[2], "a": e.color[3]} },
            { "name": "team", "value": {"type": "enum", "value": e.team, "options": [
                {"value": "red"}, {"value": "blue"}, {"value": "green"}, {"value": "spectator"}
            ]} },
            { "name": "fov", "control": "slider", "hint": {"min": 10, "max": 120, "step": 1}, "value": {"type": "float", "value": e.fov} },
            { "name": "intensity", "control": "slider", "hint": {"min": 0, "max": 10, "step": 0.05}, "value": {"type": "float", "value": e.intensity} },
        ],
    })
}

fn apply_value(entities: &mut [DemoEntity], id: &str, property: &str, value: &serde_json::Value) -> serde_json::Value {
    let Some(entity) = entities.iter_mut().find(|e| e.id.to_string() == id) else {
        return serde_json::json!({ "error": { "code": 4100, "message": format!("Unknown node: {id}") } });
    };
    let v = &value["value"];
    match property {
        "position" => {
            entity.position = [
                v["x"].as_f64().unwrap_or(entity.position[0] as f64) as f32,
                v["y"].as_f64().unwrap_or(entity.position[1] as f64) as f32,
                v["z"].as_f64().unwrap_or(entity.position[2] as f64) as f32,
            ];
        }
        "health" => entity.health = v.as_i64().unwrap_or(entity.health),
        "alive" => entity.alive = v.as_bool().unwrap_or(entity.alive),
        "speed" => entity.speed = v.as_f64().unwrap_or(entity.speed),
        "color" => {
            entity.color = [
                value["r"].as_f64().unwrap_or(entity.color[0]),
                value["g"].as_f64().unwrap_or(entity.color[1]),
                value["b"].as_f64().unwrap_or(entity.color[2]),
                value["a"].as_f64().unwrap_or(entity.color[3]),
            ];
        }
        "team" => entity.team = v.as_str().unwrap_or(&entity.team).to_string(),
        "fov" => entity.fov = v.as_f64().unwrap_or(entity.fov),
        "intensity" => entity.intensity = v.as_f64().unwrap_or(entity.intensity),
        _ => return serde_json::json!({ "error": { "code": 4102, "message": format!("Unknown property: {property}") } }),
    }
    // Echo the (normalized) value back, tagged as the UI expects.
    let echoed = serde_json::json!({
        "position": {"type": "vec3", "x": entity.position[0], "y": entity.position[1], "z": entity.position[2]},
        "health": {"type": "int", "value": entity.health},
        "alive": {"type": "bool", "value": entity.alive},
        "speed": {"type": "float", "value": entity.speed},
        "color": {"type": "color", "r": entity.color[0], "g": entity.color[1], "b": entity.color[2], "a": entity.color[3]},
        "team": {"type": "enum", "value": entity.team, "options": []},
        "fov": {"type": "float", "value": entity.fov},
        "intensity": {"type": "float", "value": entity.intensity},
    });
    serde_json::json!({ "ok": true, "value": echoed[property] })
}
