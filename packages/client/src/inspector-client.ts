import {
  encodeMessage,
  parseMessage,
  isResponse,
  isEvent,
  isSuccessResponse,
  isErrorResponse,
  Methods,
  Events,
  type Command,
  type GameInfo,
  type InspectorHelloParams,
  type InspectorHelloResult,
  type InspectorPingResult,
  type InspectorAttachParams,
  type InspectorAttachResult,
  type InspectorDetachResult,
  type RuntimeGetTreeResult,
  type RuntimeGetNodeParams,
  type RuntimeGetNodeResult,
  type RuntimeSetValueParams,
  type RuntimeSetValueResult,
  type TreeNode,
  type NodeDetail,
  type TaggedValue,
} from "@just-inspector/protocol";
import type { Transport, TransportStatusInfo } from "./transport";

export type ClientStatus = "disconnected" | "connecting" | "connected";

export interface InspectorClientOptions {
  /** Per-request timeout in ms (default 10s). */
  requestTimeoutMs?: number;
  /** Reconnect automatically after an unexpected close (default true). */
  autoReconnect?: boolean;
  /** Max reconnect attempts; Infinity = keep trying (default Infinity). */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms; grows 1.6x per attempt (default 1000). */
  reconnectDelayMs?: number;
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_OPTIONS: Required<InspectorClientOptions> = {
  requestTimeoutMs: 10_000,
  autoReconnect: true,
  maxReconnectAttempts: Infinity,
  reconnectDelayMs: 1000,
};

/**
 * Protocol endpoint. Owns the request/response id mapping, event dispatch and
 * the reconnect state machine. Transport-agnostic: pass any Transport.
 *
 * Usage:
 *   const client = new InspectorClient(new BrowserTransport());
 *   client.on(Events.nodeChanged, (p) => { ... });
 *   await client.connect("ws://127.0.0.1:8765");
 *   const { root } = await client.getTree();
 */
export class InspectorClient {
  private transport: Transport;
  private opts: Required<InspectorClientOptions>;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();
  private statusListeners = new Set<(status: ClientStatus) => void>();
  private disposers: Array<() => void> = [];
  private url: string | null = null;
  private userDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: ClientStatus = "disconnected";
  private _gameInfo: GameInfo | null = null;

  constructor(transport: Transport, options: InspectorClientOptions = {}) {
    this.transport = transport;
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.disposers.push(transport.onMessage((data) => this.handleFrame(data)));
    this.disposers.push(transport.onStatus((info) => this.handleTransportStatus(info)));
  }

  get status(): ClientStatus {
    return this._status;
  }

  get connected(): boolean {
    return this._status === "connected";
  }

  get gameInfo(): GameInfo | null {
    return this._gameInfo;
  }

  get transportKind(): string {
    return this.transport.kind;
  }

  get serverUrl(): string | null {
    return this.url;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  async connect(url?: string): Promise<void> {
    if (url) this.url = url;
    if (!this.url) throw new Error("InspectorClient.connect: no URL provided");
    this.userDisconnect = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.setStatus("connecting");
    try {
      await this.transport.connect(this.url);
    } catch (err) {
      // The transport also emits status; the reconnect logic in
      // handleTransportStatus decides what happens next.
      throw err;
    }
  }

  disconnect(): void {
    this.userDisconnect = true;
    this.clearReconnectTimer();
    this.transport.close();
    this.rejectAllPending(new Error("InspectorClient disconnected"));
    this.setStatus("disconnected");
  }

  /** Fully tear down: disconnect and unsubscribe everything. */
  destroy(): void {
    this.disconnect();
    for (const d of this.disposers) d();
    this.disposers = [];
    this.eventListeners.clear();
    this.statusListeners.clear();
  }

  /* ------------------------------ messaging ------------------------------ */

  /** Send a command and await its response. Rejects on error/timeout/disconnect. */
  request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for '${method}' response (${timeoutMs ?? this.opts.requestTimeoutMs}ms)`));
      }, timeoutMs ?? this.opts.requestTimeoutMs);

      this.pending.set(id, { method, resolve: resolve as (v: unknown) => void, reject, timer });

      const command: Command = { id, method, ...(params !== undefined ? { params } : {}) };
      this.transport.send(encodeMessage(command));
    });
  }

  /** Fire-and-forget command (no response handling). */
  sendCommand(method: string, params?: unknown): void {
    const command: Command = { id: this.nextId++, method, ...(params !== undefined ? { params } : {}) };
    this.transport.send(encodeMessage(command));
  }

  /** Send a raw pre-encoded protocol frame (debugging / host relays). */
  sendRaw(text: string): void {
    this.transport.send(text);
  }

  /* ------------------------------- events -------------------------------- */

  on(method: string, listener: (params: unknown) => void): () => void {
    let set = this.eventListeners.get(method);
    if (!set) {
      set = new Set();
      this.eventListeners.set(method, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  once(method: string, listener: (params: unknown) => void): () => void {
    const off = this.on(method, (params) => {
      off();
      listener(params);
    });
    return off;
  }

  onStatus(listener: (status: ClientStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /* --------------------------- typed convenience -------------------------- */

  hello(params?: InspectorHelloParams): Promise<InspectorHelloResult> {
    return this.request<InspectorHelloResult>(Methods.hello, params ?? { protocolVersion: "1.0" });
  }

  ping(): Promise<InspectorPingResult> {
    return this.request<InspectorPingResult>(Methods.ping);
  }

  attach(params?: InspectorAttachParams): Promise<InspectorAttachResult> {
    return this.request<InspectorAttachResult>(Methods.attach, params ?? {});
  }

  detach(): Promise<InspectorDetachResult> {
    return this.request<InspectorDetachResult>(Methods.detach);
  }

  getTree(): Promise<RuntimeGetTreeResult> {
    return this.request<RuntimeGetTreeResult>(Methods.getTree);
  }

  getNode(nodeId: string): Promise<RuntimeGetNodeResult> {
    const params: RuntimeGetNodeParams = { nodeId };
    return this.request<RuntimeGetNodeResult>(Methods.getNode, params);
  }

  setValue(nodeId: string, property: string, value: TaggedValue): Promise<RuntimeSetValueResult> {
    const params: RuntimeSetValueParams = { nodeId, property, value };
    return this.request<RuntimeSetValueResult>(Methods.setValue, params);
  }

  /* ------------------------------- internals ------------------------------ */

  private handleFrame(data: string): void {
    const message = parseMessage(data);
    if (!message) return;

    if (isResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (isSuccessResponse(message)) {
        pending.resolve(message.result);
      } else if (isErrorResponse(message)) {
        const { code, message: text } = message.error;
        const err = new Error(`Protocol error ${code} for '${pending.method}': ${text}`);
        (err as Error & { code?: number }).code = code;
        pending.reject(err);
      }
      return;
    }

    if (isEvent(message)) {
      if (message.method === Events.ready) {
        this._gameInfo = (message.params ?? null) as GameInfo | null;
      }
      const set = this.eventListeners.get(message.method);
      if (set) {
        const params = message.params;
        for (const l of [...set]) l(params);
      }
    }
  }

  private handleTransportStatus(info: TransportStatusInfo): void {
    switch (info.status) {
      case "connecting":
        this.setStatus("connecting");
        break;
      case "connected":
        this.reconnectAttempts = 0;
        this.setStatus("connected");
        break;
      case "closed":
      case "error": {
        if (this._status !== "disconnected") {
          this.rejectAllPending(new Error(`Connection lost (${info.message ?? info.status})`));
        }
        if (!this.userDisconnect && this.opts.autoReconnect && this.url) {
          this.scheduleReconnect();
        } else {
          this.setStatus("disconnected");
        }
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      this.setStatus("disconnected");
      return;
    }
    const delay = Math.min(this.opts.reconnectDelayMs * Math.pow(1.6, this.reconnectAttempts), 15_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts += 1;
      this.setStatus("connecting");
      this.transport.connect(this.url as string).catch(() => {
        /* status events drive the state machine */
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private setStatus(status: ClientStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const l of [...this.statusListeners]) l(status);
  }
}
