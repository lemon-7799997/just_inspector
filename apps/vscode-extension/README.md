# Just Inspector — VS Code extension

Inspect Godot / Bevy game runtime state from inside VS Code.

## Features

- Sidebar view (activity bar) hosting the inspector UI in a webview.
- Connects to the game's WebSocket inspector server — the connection layer runs
  in the extension host (the webview cannot open sockets itself).
- Scene tree, live property editing (text, number, slider, dropdown, checkbox,
  color picker, curve editor, vectors, JSON), and live value updates pushed by
  the game.

## Getting started

1. Run a game with an inspector server (see `docs/godot.md` / `docs/bevy.md`,
   or use the mock server: `npm run mock` in the repo).
2. Press `Ctrl+Shift+P` → **Just Inspector: Open Inspector**.
3. The inspector auto-connects to `justInspector.serverUrl`
   (default `ws://127.0.0.1:8765`).

## Configuration

| Setting                    | Default                | Description                                |
| -------------------------- | ---------------------- | ------------------------------------------ |
| `justInspector.serverUrl`  | `ws://127.0.0.1:8765`  | WebSocket URL of the game's server.        |
| `justInspector.autoConnect`| `true`                 | Connect automatically when the view opens. |

## Development

```
npm install
npm run build -w just-inspector-vscode
```

Then open the `apps/vscode-extension` folder in VS Code and press F5
(Extension Development Host). The webview UI can be developed standalone with
`npm run dev -w just-inspector-vscode-webview` (falls back to a direct browser
WebSocket when run outside VS Code).
