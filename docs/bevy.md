# Bevy integration

A minimal, compilable example lives in
[`examples/bevy-inspector`](../examples/bevy-inspector). It runs a **headless**
Bevy app that simulates a few entities and exposes them over the WebSocket
protocol on `ws://127.0.0.1:8765`.

```bash
cd examples/bevy-inspector
cargo run
```

Then connect the inspector UI (browser build or VS Code extension).

## Architecture

The example deliberately keeps the ECS and the network apart:

```
bevy main thread                     server thread (tokio)
┌──────────────────────┐             ┌──────────────────────────────┐
│ InspectorState       │             │ TcpListener :8765            │
│  entities (demo)     │  crossbeam  │  per-client task:            │
│  pump_inspector(s)   │ ──commands──▶   tokio-tungstenite socket   │
│  simulate_world(s)   │ ──oneshot───▶   replies                    │
│                      │ ◀─broadcast──   Runtime.* events           │
└──────────────────────┘             └──────────────────────────────┘
```

- `inspector.rs` — the server thread: accepts clients, parses JSON frames,
  forwards `InspectorCommand`s to the main thread, relays replies and
  broadcasts `Runtime.nodeChanged` events.
- `main.rs` — `InspectorState` resource (demo entities as plain data),
  `pump_inspector` (answers commands by reading/writing the resource) and
  `simulate_world` (mutates values and pushes events).

## Using it with real components

Swap the demo data for your real ECS data. Two options:

**Option A — answer from systems (recommended).** Keep `InspectorCommand`
channels; in `pump_inspector`, use the world to answer:

```rust
InspectorCommand::GetNode { id, reply } => {
    let Some(entity) = world.get_entity(Entity::from_raw(id.parse().unwrap())) else { ... };
    let name = world.get::<Name>(entity).map(|n| n.as_str().to_string()).unwrap_or_default();
    let pos = world.get::<Transform>(entity).map(|t| t.translation);
    let _ = reply.send(node_json(entity, name, pos));
}
```

`Runtime.setValue` writes via `world.get_mut::<Transform>(entity)` etc.

**Option B — reflection.** Use `bevy_reflect` (ships with Bevy) to walk
`ReflectComponent` of each entity and auto-generate the property list, similar
to what `bevy-inspector-egui` does.

## Pushing live updates

Any system can notify the UI:

```rust
fn report(mut state: ResMut<InspectorState>, ...) {
    // after changing something:
    let _ = state.event_tx.send(serde_json::json!({
        "method": "Runtime.nodeChanged",
        "params": { "nodeId": entity.id().to_string(), "property": "health" }
    }));
}
```

Structure changes (spawn/despawn) should send `Runtime.treeChanged` so the UI
refetches the tree.
