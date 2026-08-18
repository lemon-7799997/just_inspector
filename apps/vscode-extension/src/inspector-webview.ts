import * as vscode from "vscode";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { NodeTransport } from "@just-inspector/client/node";
import type { TransportStatusInfo } from "@just-inspector/client";

/**
 * How the connection layer works in VS Code mode:
 *
 *   game server  <--WebSocket (NodeTransport)-->  extension host  <--postMessage-->  webview UI
 *
 * The webview is sandboxed and cannot open raw sockets, so the actual WebSocket
 * lives here, in the extension host. The webview's `VscodeWebviewTransport`
 * posts frames over the VS Code message API; this provider relays them verbatim
 * to the socket and relays socket messages/status back. The protocol state
 * machine (InspectorClient) runs in the webview — the same code as the browser
 * build.
 */
export class InspectorWebviewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "justInspector.view";

  private view: vscode.WebviewView | undefined;
  private transport: NodeTransport | undefined;
  private disposers: Array<() => void> = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    webviewView.onDidDispose(() => {
      this.disconnect();
      this.view = undefined;
    });

    this.pushConfig();
  }

  /** Push current settings to the webview (server URL + auto-connect). */
  pushConfig(): void {
    const cfg = vscode.workspace.getConfiguration("justInspector");
    const url = cfg.get<string>("serverUrl") ?? "ws://127.0.0.1:8765";
    const autoConnect = cfg.get<boolean>("autoConnect") ?? true;
    this.post({ type: "inspector-config", url, autoConnect });
  }

  /* ------------------------------ bridge ------------------------------ */

  private handleMessage(msg: unknown): void {
    const m = msg as { type?: string; url?: string; payload?: string } | undefined;
    switch (m?.type) {
      case "inspector-connect":
        if (typeof m.url === "string") this.connect(m.url);
        break;
      case "inspector-disconnect":
        this.disconnect();
        break;
      case "inspector-message":
        if (typeof m.payload === "string") this.transport?.send(m.payload);
        break;
      default:
        break;
    }
  }

  private connect(url: string): void {
    this.disconnect();

    const transport = new NodeTransport();
    this.transport = transport;
    this.disposers.push(
      transport.onStatus((info: TransportStatusInfo) => {
        this.post({ type: "inspector-status", status: info });
      }),
      transport.onMessage((data: string) => {
        this.post({ type: "inspector-message", payload: data });
      }),
    );

    transport.connect(url).catch(() => {
      /* status events drive the UI state machine */
    });
  }

  private disconnect(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.transport?.close();
    this.transport = undefined;
  }

  private post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }

  /* ------------------------------- html ------------------------------- */

  private getHtml(webview: vscode.Webview): string {
    const indexPath = join(this.extensionUri.fsPath, "dist", "webview", "index.html");
    let html = readFileSync(indexPath, "utf-8");

    // The webview CSP cannot use 'unsafe-inline' for scripts, so tag every
    // inline <script> (the single-file build inlines everything) with a nonce.
    const nonce = getNonce();
    html = html.replace(/<script/g, `<script nonce="${nonce}"`);

    const csp = [
      "default-src 'none'",
      "img-src data: blob: https:",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
      "font-src data:",
    ].join("; ");

    if (!/<meta[^>]*http-equiv="Content-Security-Policy"/i.test(html)) {
      html = html.replace(/<head>/, `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);
    }
    return html;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = randomBytes(20);
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}
