import { TransportBase, type Transport } from "./transport";

export interface BrowserTransportOptions {
  connectTimeoutMs?: number;
}

/**
 * WebSocket transport for browsers (the standalone web app). Uses the
 * platform WebSocket API — no Node dependencies.
 */
export class BrowserTransport extends TransportBase implements Transport {
  readonly kind = "browser";
  private ws: WebSocket | null = null;
  private settleOpen: (() => void) | null = null;
  private settleFail: ((err: Error) => void) | null = null;
  private timeoutMs: number;

  constructor(options: BrowserTransportOptions = {}) {
    super();
    this.timeoutMs = options.connectTimeoutMs ?? 10_000;
  }

  connect(url: string): Promise<void> {
    if (typeof WebSocket === "undefined") {
      return Promise.reject(new Error("WebSocket is not available in this environment"));
    }
    this.close();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      this.emitStatus({ status: "connecting", message: url });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.settleOpen = null;
        this.settleFail = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`Timed out connecting to ${url}`));
        this.emitStatus({ status: "error", message: "connect timeout" });
      }, this.timeoutMs);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.settleOpen = null;
        this.settleFail = null;
        this.emitStatus({ status: "connected", message: url });
        resolve();
      };

      ws.onmessage = (ev: MessageEvent) => {
        this.emitMessage(String(ev.data));
      };

      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.settleOpen = null;
        this.settleFail = null;
        reject(new Error(`WebSocket error connecting to ${url}`));
        this.emitStatus({ status: "error", message: `WebSocket error connecting to ${url}` });
      };

      ws.onclose = (ev: CloseEvent) => {
        if (!settled) {
          // Closed before ever opening — treat as a failed connect.
          settled = true;
          clearTimeout(timer);
          this.settleOpen = null;
          this.settleFail = null;
          reject(new Error(`Connection to ${url} closed (${ev.code} ${ev.reason})`));
        }
        this.ws = null;
        this.emitStatus({ status: "closed", message: ev.reason || undefined });
      };
    });
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  close(): void {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}
