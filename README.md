# Just Inspector

A standalone runtime inspector UI for **Godot / Bevy** (or any game) projects.
The game hosts a small WebSocket server; the inspector connects to it and lets
you browse the live scene tree and edit values while the game runs — the same
idea as the Chrome DevTools protocol, but for games.

```
┌──────────────────────┐   JSON frames    ┌─────────────────────────────┐
│  game (Godot/Bevy)   │ ◄──WebSocket────► │  Just Inspector UI (Vue 3) │
│  inspector server    │                  │  node tree + property grid  │
└──────────────────────┘                  └─────────────────────────────┘
```

- **Protocol**: plain JSON text frames, CDP-style envelopes — see
  [`docs/protocol.md`](docs/protocol.md).
- **UI**: fully standalone Vue 3 app (no game code in it).
- **Connection layer**: separate package, transport-agnostic.
- **Two packaging modes**:
  1. **Browser** — the whole app (UI + connection layer) bundles into static
     files; open it and connect straight to the game.
  2. **VS Code extension** — the same Vue UI runs in a webview; the connection
     layer runs in the **extension host** (webviews can't open sockets) and
     bridges to the game over `ws`.
- **Controls**: text, int/float input, slider (int/float), dropdown, checkbox,
  color picker, curve editor, vectors, JSON.

## Quick start

```bash
npm install

# 1. Start the mock game server (simulates a Godot/Bevy-like scene with live changes)
npm run mock
#   -> listening on ws://127.0.0.1:8765

# 2a. Browser mode
npm run dev:web
#   -> open http://localhost:5173 and click Connect

# 2b. VS Code mode
npm run build -w just-inspector-vscode
#   -> open the apps/vscode-extension folder in VS Code and press F5
```

End-to-end protocol test (starts the mock server in-process, runs 21
assertions against a real client):

```bash
npm run smoke
```

## Repo layout

```
packages/
  protocol/         @just-inspector/protocol      JSON wire protocol (envelopes, tagged values, schema)
  client/           @just-inspector/client        connection layer: InspectorClient + transports
                     .            browser WebSocket
                     ./node       Node/VS Code-host WebSocket (ws)
                     ./vscode-webview  webview <-> host postMessage bridge
  inspector-ui/     @just-inspector/inspector-ui  Vue 3 components (tree, property grid, controls) + app shell
apps/
  web/              browser build (Vite) — connection layer bundled in
  mock-server/      mock game server + end-to-end smoke test
  vscode-extension/ VS Code extension: webview UI + extension-host connection bridge
    webview/        the same Vue app built single-file for the webview
examples/
  godot/            Godot 4 addon: inspector_server.gd (drop-in autoload)
  bevy-inspector/   Bevy example: headless app + WS server thread (cargo run)
docs/
  protocol.md       protocol specification
  godot.md          Godot integration guide
  bevy.md           Bevy integration guide
```

## How the connection layer works

A `Transport` owns one socket and exchanges **raw JSON text frames**; the
`InspectorClient` sits on top and owns the protocol state machine
(request/response id mapping, events, auto-reconnect).

- **Browser mode**: `BrowserTransport` (native `WebSocket`) — everything runs
  in the page.
- **VS Code mode**: the socket lives in the **extension host** (`NodeTransport`,
  `ws` package). The webview's `VscodeWebviewTransport` relays frames over the
  VS Code `postMessage` API, and `InspectorWebviewProvider` pipes them to/from
  the socket. The protocol state machine still runs in the webview, so browser
  and webview share 100% of the UI + client code.

```
game server ◄──ws──► extension host (NodeTransport) ◄──postMessage──► webview UI
```

## Game-side integration

- **Godot** — copy `examples/godot/addons/just_inspector` into your project's
  `addons/`, add `inspector_server.gd` as an autoload. It serves the scene tree
  and exported properties, and supports writing values back. See
  [`docs/godot.md`](docs/godot.md).
- **Bevy** — `examples/bevy-inspector` is a compiling reference: a dedicated
  server thread (tokio + tokio-tungstenite) communicates with the ECS through
  channels. See [`docs/bevy.md`](docs/bevy.md).

## Input controls

| Control      | Value types        | Notes                                              |
| ------------ | ------------------ | -------------------------------------------------- |
| Text         | `string`           | single-line or multiline (hint `multiline`)        |
| Number       | `int`, `float`     | step/min/max from hint                             |
| Slider       | `int`, `float`     | range + numeric field; live updates                |
| Dropdown     | `enum`             | options from the value or hint                     |
| Checkbox     | `bool`             |                                                     |
| Color        | `color`            | [vue-color-kit](https://github.com/anish2690/vue-color-kit) |
| Curve editor | `curve`            | canvas editor: drag points/tangents, dbl-click to remove |
| Vector       | `vec2/3/4`         | labelled numeric fields                            |
| JSON         | `array`/`object`/… | editable tagged JSON (fallback for unknown types)  |

> Note: there is no mature, widely-adopted Vue 3 animation-curve editor, so
> the curve control is a small dependency-free canvas component in
> `packages/inspector-ui` — color picking uses the most popular Vue 3 picker
> (`vue-color-kit`).

## Protocol in one screen

```json
→ {"id":1,"method":"Runtime.getTree"}
← {"id":1,"result":{"root":{...}}}
→ {"id":2,"method":"Runtime.setValue","params":{"nodeId":"2","property":"health","value":{"type":"int","value":42}}}
← {"id":2,"result":{"ok":true,"value":{"type":"int","value":42}}}
← {"method":"Runtime.nodeChanged","params":{"nodeId":"2","property":"health"}}
```

## License

MIT
