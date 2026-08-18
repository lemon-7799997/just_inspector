/**
 * Transport abstraction — the "connection layer".
 *
 * A Transport owns one WebSocket-like connection and deals in raw JSON text
 * frames. It never interprets the protocol; the InspectorClient does that.
 *
 * Implementations:
 *   - BrowserTransport           (browser WebSocket)
 *   - NodeTransport              (`ws` package — Node.js & VS Code extension host)
 *   - VscodeWebviewTransport     (webview <-> extension host postMessage bridge;
 *                                 the real socket lives in the extension host)
 */

export type TransportStatus = "connecting" | "connected" | "closed" | "error";

export interface TransportStatusInfo {
  status: TransportStatus;
  message?: string;
}

export type TransportMessageListener = (data: string) => void;
export type TransportStatusListener = (info: TransportStatusInfo) => void;

export interface Transport {
  readonly kind: string;
  /**
   * Open a connection to `url`. Resolves once the socket is open, rejects on
   * failure/timeout. A transport instance may be reconnected by calling
   * connect() again after a close.
   */
  connect(url: string): Promise<void>;
  /** Send one raw JSON text frame. */
  send(data: string): void;
  /** Close the socket (user-initiated; no reconnect should follow). */
  close(): void;
  /** Subscribe to raw frames. Returns an unsubscribe function. */
  onMessage(listener: TransportMessageListener): () => void;
  /** Subscribe to transport lifecycle status changes. Returns an unsubscribe function. */
  onStatus(listener: TransportStatusListener): () => void;
}

/** Shared subscriber-set plumbing used by every transport implementation. */
export class TransportBase {
  protected messageListeners = new Set<TransportMessageListener>();
  protected statusListeners = new Set<TransportStatusListener>();

  onMessage(listener: TransportMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: TransportStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  protected emitMessage(data: string): void {
    for (const l of this.messageListeners) l(data);
  }

  protected emitStatus(info: TransportStatusInfo): void {
    for (const l of this.statusListeners) l(info);
  }
}
