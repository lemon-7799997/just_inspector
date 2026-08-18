# Just Inspector protocol

Version **1.0** · Transport: one WebSocket, text frames, one JSON message per frame.

The protocol is deliberately small and CDP-inspired:

- **Commands** (inspector → game): `{ "id": number, "method": string, "params"?: object }`
- **Responses** (game → inspector): `{ "id": number, "result": object }` or `{ "id": number, "error": { "code": number, "message": string } }`
- **Events** (game → inspector): `{ "method": string, "params"?: object }` — no `id`

A frame with `id` + `method` is a command; `id` without `method` is a response;
`method` without `id` is an event.

## Handshake

1. Inspector connects to `ws://host:port`.
2. Game immediately pushes `Inspector.ready` (event) with its identity.
3. Inspector may call `Inspector.hello` to (re)query the same info, then
   `Runtime.getTree` etc.

## Methods

| Method               | Params                              | Result                                    |
| -------------------- | ----------------------------------- | ----------------------------------------- |
| `Inspector.hello`    | `{ clientName?, protocolVersion? }` | `GameInfo`                                |
| `Inspector.ping`     | —                                   | `{ pong: "pong" }`                        |
| `Inspector.attach`   | `{ name? }`                         | `{ sessionId }`                           |
| `Inspector.detach`   | —                                   | `{ ok: true }`                            |
| `Runtime.getTree`    | —                                   | `{ root: TreeNode }`                      |
| `Runtime.getNode`    | `{ nodeId }`                        | `{ node: NodeDetail }`                    |
| `Runtime.setValue`   | `{ nodeId, property, value }`       | `{ ok: true, value }` (normalized echo)   |

`attach`/`detach` are optional; games that don't need sessions can answer with
a fixed `sessionId` / `{ ok: true }`.

## Events

| Event                     | Params                                        | Meaning                              |
| ------------------------- | --------------------------------------------- | ------------------------------------ |
| `Inspector.ready`         | `GameInfo`                                    | Sent right after the socket opens.   |
| `Runtime.treeChanged`     | `{ reason? }`                                 | Scene structure changed — re-fetch.  |
| `Runtime.nodeChanged`     | `{ nodeId, property? }`                       | One node's value(s) changed.         |

## Types

### GameInfo

```json
{
  "gameName": "My Game",
  "engine": "godot",
  "engineVersion": "4.3",
  "protocolVersion": "1.0",
  "capabilities": ["live-values", "curves"]
}
```

### TreeNode

```json
{
  "id": "node:player",
  "name": "Player",
  "kind": "CharacterBody3D",
  "children": [ ... ]
}
```

### NodeDetail

```json
{
  "id": "node:player",
  "name": "Player",
  "kind": "CharacterBody3D",
  "path": "/root/World/Player",
  "properties": [
    {
      "name": "health",
      "displayName": "Health",
      "value": { "type": "int", "value": 80 },
      "control": "slider",
      "hint": { "min": 0, "max": 100, "step": 1 },
      "readOnly": false,
      "tooltip": "..."
    }
  ]
}
```

`control` (optional) hints at the widget; `"auto"` or missing = the UI derives
one from `value.type`. `hint` tunes the control: `min/max/step`, `options`,
`multiline`, `placeholder`, `valueMin/valueMax/timeMin/timeMax/curveEditable`.

### Tagged values

Every runtime value is self-describing. The UI renders whatever `type` it
sees; unknown types fall back to a JSON editor.

| type     | payload                                          |
| -------- | ------------------------------------------------ |
| `null`   | `{ "type": "null" }`                             |
| `int`    | `{ "type": "int", "value": 5 }`                  |
| `float`  | `{ "type": "float", "value": 1.5 }`              |
| `bool`   | `{ "type": "bool", "value": true }`              |
| `string` | `{ "type": "string", "value": "hello" }`         |
| `color`  | `{ "type": "color", "r": 1, "g": 0.5, "b": 0, "a": 1 }` (0..1 floats) |
| `enum`   | `{ "type": "enum", "value": "red", "options": [ { "value": "red", "label": "Red" } ] }` |
| `vec2`   | `{ "type": "vec2", "x": 1, "y": 2 }`             |
| `vec3`   | `{ "type": "vec3", "x": 1, "y": 2, "z": 3 }`     |
| `vec4`   | `{ "type": "vec4", "x": 1, "y": 2, "z": 3, "w": 4 }` |
| `curve`  | `{ "type": "curve", "mode": "bezier", "points": [ { "x": 0, "y": 0, "lx": 0, "ly": 0, "rx": 0.5, "ry": 1 } ] }` |
| `array`  | `{ "type": "array", "itemType": "int", "items": [ ... ] }` |
| `object` | `{ "type": "object", "fields": { "key": { ... } } }` |
| `asset`  | `{ "type": "asset", "kind": "texture", "path": "res://icon.png" }` |

Curve tangents (`lx/ly` left, `rx/ry` right) are offsets in (time, value)
units — matching Godot's `Curve.set_point_left_tangent/right_tangent` and
Unity-style keyframe tangent semantics.

## Error codes

| Code  | Meaning                        |
| ----- | ------------------------------ |
| -32700| Parse error                    |
| -32601| Method not found               |
| -32602| Invalid params                 |
| -32603| Internal error                 |
| 4100  | Unknown node                   |
| 4101  | Read-only property             |
| 4102  | Invalid value (type/range)     |
| 4103  | Not attached                   |
| 4104  | Protocol version mismatch      |

## Example session

```
→ {"id":1,"method":"Inspector.hello"}
← {"id":1,"result":{"gameName":"Demo","engine":"godot","protocolVersion":"1.0"}}
→ {"id":2,"method":"Runtime.getTree"}
← {"id":2,"result":{"root":{"id":"1","name":"MainScene","children":[{"id":"2","name":"Player","kind":"CharacterBody3D"}]}}}
→ {"id":3,"method":"Runtime.getNode","params":{"nodeId":"2"}}
← {"id":3,"result":{"node":{...}}}
→ {"id":4,"method":"Runtime.setValue","params":{"nodeId":"2","property":"health","value":{"type":"int","value":42}}}
← {"id":4,"result":{"ok":true,"value":{"type":"int","value":42}}}
← {"method":"Runtime.nodeChanged","params":{"nodeId":"2","property":"health"}}
```
