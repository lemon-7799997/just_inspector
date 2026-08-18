import WebSocket from "ws";
import { TransportBase, type Transport } from "./transport";

export interface NodeTransportOptions {
  connectTimeoutMs?: number;
}

/**
 * WebSocket transport for Node.js — used by the mock server smoke tests and
 * by the VS Code extension host (where the UI cannot open sockets itself).
 */
export class NodeTransport extends TransportBase implements Transport {
  readonly kind = "node";
  private ws: WebSocket | null = null;
  private timeoutMs: number;

  constructor(options: NodeTransportOptions = {}) {
    super();
    this.timeoutMs = options.connectTimeoutMs ?? 10_000;
  }

  connect(url: string): Promise<void> {
    this.close();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      this.emitStatus({ status: "connecting", message: url });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        reject(new Error(`Timed out connecting to ${url}`));
        this.emitStatus({ status: "error", message: "connect timeout" });
      }, this.timeoutMs);

      ws.on("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.emitStatus({ status: "connected", message: url });
        resolve();
      });

      ws.on("message", (data: WebSocket.RawData) => {
        this.emitMessage(data.toString());
      });

      ws.on("error", (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`WebSocket error connecting to ${url}: ${err.message}`));
          this.emitStatus({ status: "error", message: err.message });
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Connection to ${url} closed (${code} ${reason.toString()})`));
        }
        this.ws = null;
        this.emitStatus({ status: "closed", message: reason.toString() || undefined });
      });
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
