import { createApp } from "vue";
import { InspectorApp } from "@just-inspector/inspector-ui";
import "@just-inspector/inspector-ui/style.css";
import { BrowserTransport, type Transport } from "@just-inspector/client";
import { VscodeWebviewTransport } from "@just-inspector/client/vscode-webview";

/**
 * VS Code webview build of Just Inspector.
 *
 * Inside VS Code the webview cannot open sockets, so the connection layer runs
 * in the extension host: this app talks to it through the VS Code postMessage
 * API via VscodeWebviewTransport. Outside VS Code (vite dev) it falls back to
 * a direct browser WebSocket so the UI can be styled/debugged standalone.
 */

function createTransport(): Transport {
  const acquire = (window as Window & { acquireVsCodeApi?: () => { postMessage(m: unknown): void } }).acquireVsCodeApi;
  if (typeof acquire === "function") {
    return new VscodeWebviewTransport(acquire());
  }
  return new BrowserTransport();
}

createApp(InspectorApp, {
  transportFactory: createTransport,
  initialUrl: "ws://127.0.0.1:8765",
}).mount("#app");
