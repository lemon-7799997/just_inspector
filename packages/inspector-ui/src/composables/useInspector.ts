import { shallowRef, ref, computed, onMounted, onUnmounted } from "vue";
import { InspectorClient, Events, PROTOCOL_VERSION, type ClientStatus, type GameInfo, type NodeDetail, type TaggedValue, type Transport, type TreeNode } from "@just-inspector/client";
import { createPersistence, type TreeDockPosition, type TreeDockSide } from "./persistence";

export interface ToastItem {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

export interface LogEntry {
  at: number;
  dir: "in" | "out";
  text: string;
}

export interface UseInspectorOptions {
  transportFactory: () => Transport;
  initialUrl?: string;
  autoConnect?: boolean;
}

/**
 * Reactive state + actions that power the InspectorApp shell. Owns the
 * InspectorClient instance and translates protocol events into UI state.
 */
export function useInspector(options: UseInspectorOptions) {
  const transport = options.transportFactory();
  const client = new InspectorClient(transport, { autoReconnect: true });
  const persistence = createPersistence(transport);

  /** Saved tree-panel dock side (persisted per mode). */
  const treeDock = ref<TreeDockPosition>(loadTreeDock());

  function setTreeDock(dock: TreeDockPosition): void {
    treeDock.value = dock;
    persistence.set("treeDock", dock);
  }

  /**
   * Read the persisted dock side.
   *
   * Only `left` / `right` are selectable now, so a stored vertical layout
   * (`"top"`, or the pre-0.0.6 `"bottom"`) carries no horizontal preference to
   * restore and falls back to the default. The vertical layout is derived from
   * the window aspect instead — see [`treeDockSide`].
   */
  function loadTreeDock(): TreeDockPosition {
    return persistence.get("treeDock") === "right" ? "right" : "left";
  }

  /**
   * Width/height ratio below which the shell stops showing the tree as a side
   * panel and stacks it above (or below) the grid instead. A narrow window has
   * no width to spare for two columns, so the vertical layout wins there.
   */
  const VERTICAL_BELOW_ASPECT = 1;

  /** Whether the window is narrower than it is tall. */
  const verticalLayout = ref(
    typeof window !== "undefined" && window.innerWidth / Math.max(1, window.innerHeight) < VERTICAL_BELOW_ASPECT,
  );

  function updateLayout(): void {
    verticalLayout.value = window.innerWidth / Math.max(1, window.innerHeight) < VERTICAL_BELOW_ASPECT;
  }

  /**
   * The dock side to render: the saved side while the window is wide enough for
   * two columns, a full-width strip (above or below the grid) when it is not.
   */
  const treeDockSide = computed<TreeDockSide>(() =>
    verticalLayout.value ? (treeDock.value === "left" ? "top" : "bottom") : treeDock.value,
  );

  /**
   * Global display preference: render machine field names as spaced
   * UpperCamelCase (`field_center` -> "Field Center"). On by default; games can
   * still override a single field with an explicit `displayName`.
   */
  const prettyNames = ref<boolean>(persistence.get("prettyNames") !== false);

  function setPrettyNames(value: boolean): void {
    prettyNames.value = value;
    persistence.set("prettyNames", value);
  }

  const status = ref<ClientStatus>("disconnected");
  const gameInfo = shallowRef<GameInfo | null>(null);
  const tree = shallowRef<TreeNode | null>(null);
  const selectedId = ref<string | null>(null);
  const detail = ref<NodeDetail | null>(null);
  const url = ref(options.initialUrl ?? "");
  const toasts = ref<ToastItem[]>([]);
  const log = ref<LogEntry[]>([]);
  const logVisible = ref(false);

  const pending = new Set<string>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let toastSeq = 0;
  let detailRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let statusOff: () => void = () => {};
  let readyOff: () => void = () => {};
  let treeOff: () => void = () => {};
  let nodeOff: () => void = () => {};

  onMounted(() => {
    window.addEventListener("resize", updateLayout);
    updateLayout();

    statusOff = client.onStatus((s) => {
      status.value = s;
      if (s === "disconnected" && gameInfo.value) {
        gameInfo.value = null;
        tree.value = null;
        detail.value = null;
      }
      if (s === "connected") {
        void hello();
      }
    });

    readyOff = client.on(Events.ready, (params) => {
      const info = params as GameInfo;
      if (info && info.gameName) gameInfo.value = info;
    });

    treeOff = client.on(Events.treeChanged, () => {
      pushLog("in", "Runtime.treeChanged");
      void refreshTree();
    });

    nodeOff = client.on(Events.nodeChanged, (params) => {
      const p = params as { nodeId: string; property?: string };
      pushLog("in", `Runtime.nodeChanged ${p.nodeId}${p.property ? " " + p.property : ""}`);
      if (p.nodeId === selectedId.value) scheduleDetailRefresh();
    });

    if (options.autoConnect && url.value) {
      // Quiet: the game may legitimately not be running yet; the reconnect
      // loop keeps trying and the status dot already shows the state.
      void connect(undefined, true);
    }

    // VS Code mode: the extension host pushes the configured server URL.
    const configurable = transport as unknown as {
      onConfig?: (cb: (config: { url?: string; autoConnect?: boolean }) => void) => void;
    };
    if (typeof configurable.onConfig === "function") {
      configurable.onConfig((config) => {
        if (config.url) url.value = config.url;
        if (config.autoConnect && config.url) void connect(config.url);
      });
    }
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateLayout);
    statusOff();
    readyOff();
    treeOff();
    nodeOff();
    for (const t of debounceTimers.values()) clearTimeout(t);
    if (detailRefreshTimer) clearTimeout(detailRefreshTimer);
    client.destroy();
  });

  /* ------------------------------- actions ------------------------------- */

  async function hello(): Promise<void> {
    try {
      const info = await client.hello();
      gameInfo.value = info;
      if (info.protocolVersion && info.protocolVersion !== PROTOCOL_VERSION) {
        toast("error", `Protocol version mismatch — game: ${info.protocolVersion}, inspector: ${PROTOCOL_VERSION}`);
      }
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Connect to `urlArg` (or the current URL). `quiet` suppresses the
   * connecting/failure toasts, for the automatic startup attempt.
   */
  async function connect(urlArg?: string, quiet = false): Promise<void> {
    if (urlArg) url.value = urlArg;
    if (status.value === "connecting" || status.value === "connected") return;
    if (!url.value.trim()) {
      toast("error", "Enter a WebSocket URL first");
      return;
    }
    if (!quiet) toast("info", `Connecting to ${url.value}…`);
    pushLog("out", `connect ${url.value}`);
    try {
      await client.connect(url.value.trim());
      toast("success", "Connected");
      await refreshTree();
    } catch (err) {
      if (!quiet) toast("error", `Connection failed: ${(err as Error).message}`);
    }
  }

  function disconnect(): void {
    client.disconnect();
    toast("info", "Disconnected");
  }

  async function refreshTree(): Promise<void> {
    if (!client.connected) return;
    try {
      const { root } = await client.getTree();
      tree.value = root;
    } catch (err) {
      toast("error", `getTree failed: ${(err as Error).message}`);
    }
  }

  async function selectNode(id: string | null): Promise<void> {
    selectedId.value = id;
    detail.value = null;
    if (id) await loadDetail(id);
  }

  async function loadDetail(id: string): Promise<void> {
    try {
      const { node } = await client.getNode(id);
      if (selectedId.value === id) detail.value = node;
    } catch (err) {
      const code = (err as Error & { code?: number }).code;
      if (code === 4100) {
        toast("error", `Node ${id} no longer exists — refreshing tree`);
        void refreshTree();
      } else {
        toast("error", `getNode failed: ${(err as Error).message}`);
      }
    }
  }

  function scheduleDetailRefresh(): void {
    if (detailRefreshTimer) clearTimeout(detailRefreshTimer);
    detailRefreshTimer = setTimeout(() => {
      detailRefreshTimer = null;
      if (selectedId.value) void loadDetail(selectedId.value);
    }, 120);
  }

  /** Live update from a control: optimistic UI + optional debounced send. */
  function onUpdate(property: string, value: TaggedValue, live: boolean): void {
    applyOptimistic(property, value);
    if (live) {
      const key = `${selectedId.value}/${property}`;
      const prev = debounceTimers.get(key);
      if (prev) clearTimeout(prev);
      debounceTimers.set(
        key,
        setTimeout(() => {
          debounceTimers.delete(key);
          void sendValue(property, value);
        }, 250),
      );
    }
  }

  /** Final value from a control (blur / pointer-up / change): send now. */
  function onCommit(property: string, value: TaggedValue): void {
    applyOptimistic(property, value);
    const key = `${selectedId.value}/${property}`;
    const prev = debounceTimers.get(key);
    if (prev) {
      clearTimeout(prev);
      debounceTimers.delete(key);
    }
    void sendValue(property, value);
  }

  function applyOptimistic(property: string, value: TaggedValue): void {
    const d = detail.value;
    if (!d) return;
    const p = d.properties.find((x) => x.name === property);
    if (p && !p.readOnly) p.value = value;
  }

  async function sendValue(property: string, value: TaggedValue): Promise<void> {
    const id = selectedId.value;
    if (!id || !client.connected) return;
    const key = `${id}/${property}`;
    if (pending.has(key)) return;
    pending.add(key);
    try {
      const res = await client.setValue(id, property, value);
      const d = detail.value;
      if (d && d.id === id) {
        const p = d.properties.find((x) => x.name === property);
        if (p) p.value = res.value; // authoritative echo from the game
      }
    } catch (err) {
      toast("error", `set '${property}': ${(err as Error).message}`);
      await loadDetail(id); // revert
    } finally {
      pending.delete(key);
    }
  }

  /* ------------------------------ misc state ------------------------------ */

  function toast(kind: ToastItem["kind"], text: string): void {
    const id = ++toastSeq;
    toasts.value.push({ id, kind, text });
    if (toasts.value.length > 5) toasts.value.shift();
    setTimeout(() => {
      const idx = toasts.value.findIndex((t) => t.id === id);
      if (idx >= 0) toasts.value.splice(idx, 1);
    }, 4500);
  }

  function dismissToast(id: number): void {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx >= 0) toasts.value.splice(idx, 1);
  }

  function pushLog(dir: LogEntry["dir"], text: string): void {
    log.value.push({ at: Date.now(), dir, text });
    if (log.value.length > 300) log.value.splice(0, log.value.length - 300);
  }

  function clearLog(): void {
    log.value = [];
  }

  return {
    client,
    status,
    gameInfo,
    tree,
    selectedId,
    detail,
    url,
    toasts,
    log,
    logVisible,
    treeDock,
    setTreeDock,
    treeDockSide,
    prettyNames,
    setPrettyNames,
    connect,
    disconnect,
    refreshTree,
    selectNode,
    onUpdate,
    onCommit,
    toast,
    dismissToast,
    toggleLog: () => (logVisible.value = !logVisible.value),
    clearLog,
  };
}

export type InspectorStore = ReturnType<typeof useInspector>;
