import { TransportBase, type Transport } from "./transport";

/**
 * Transport for the VS Code webview.
 *
 * Webviews are sandboxed and cannot open raw sockets, so the actual WebSocket
 * lives in the extension host. This transport bridges over the VS Code
 * `postMessage` API:
 *
 *   webview --postMessage--> extension host --ws.send--> game server
 *   webview <--postMessage-- extension host <--ws message-- game server
 *
 * Frame protocol between webview and host (all plain objects):
 *   { type: "inspector-connect",     url }            webview -> host
 *   { type: "inspector-disconnect" }                  webview -> host
 *   { type: "inspector-message",    payload }         both directions (raw JSON text)
 *   { type: "inspector-status",     status }          host -> webview
 *   { type: "inspector-config",     url, autoConnect } host -> webview
 */

export interface VscodeApiLike {
  postMessage(message: unknown): void;
  getState?: () => unknown;
  setState?: (state: unknown) => void;
}

export interface VscodeConfigMessage {
  type: "inspector-config";
  url?: string;
  autoConnect?: boolean;
}

export type VscodeConfigListener = (config: VscodeConfigMessage) => void;

export class VscodeWebviewTransport extends TransportBase implements Transport {
  readonly kind = "vscode-webview";
  private api: VscodeApiLike;
  private configListeners = new Set<VscodeConfigListener>();
  private attached = false;

  constructor(api: VscodeApiLike) {
    super();
    this.api = api;
    this.attachWindowListener();
  }

  /** Subscribe to the config pushed by the extension host (server URL etc.). */
  onConfig(listener: VscodeConfigListener): () => void {
    this.configListeners.add(listener);
    return () => this.configListeners.delete(listener);
  }

  connect(url: string): Promise<void> {
    this.api.postMessage({ type: "inspector-connect", url });
    this.emitStatus({ status: "connecting", message: url });
    return Promise.resolve();
  }

  send(data: string): void {
    this.api.postMessage({ type: "inspector-message", payload: data });
  }

  close(): void {
    this.api.postMessage({ type: "inspector-disconnect" });
  }

  /** Webview workspace state (persisted by the extension host). */
  getState(): unknown {
    return this.api.getState?.();
  }

  /** Persist webview workspace state (survives webview reloads). */
  setState(state: unknown): void {
    this.api.setState?.(state);
  }

  dispose(): void {
    if (this.attached && typeof window !== "undefined") {
      window.removeEventListener("message", this.handleMessage);
      this.attached = false;
    }
  }

  private attachWindowListener(): void {
    if (this.attached || typeof window === "undefined") return;
    window.addEventListener("message", this.handleMessage);
    this.attached = true;
  }

  private handleMessage = (ev: MessageEvent): void => {
    const m: unknown = ev.data;
    if (typeof m !== "object" || m === null) return;
    const msg = m as Record<string, unknown>;
    switch (msg.type) {
      case "inspector-message":
        if (typeof msg.payload === "string") this.emitMessage(msg.payload);
        break;
      case "inspector-status": {
        const info = msg.status as { status?: string; message?: string };
        if (info && typeof info.status === "string") {
          this.emitStatus({
            status: info.status as "connecting" | "connected" | "closed" | "error",
            message: typeof info.message === "string" ? info.message : undefined,
          });
        }
        break;
      }
      case "inspector-config":
        for (const l of this.configListeners) l(msg as unknown as VscodeConfigMessage);
        break;
      default:
        break;
    }
  };
}
