<script setup lang="ts">
import type { Transport } from "@just-inspector/client";
import { useInspector } from "../composables/useInspector";
import ConnectionBar from "./connection/ConnectionBar.vue";
import NodeTree from "./tree/NodeTree.vue";
import PropertyGrid from "./props/PropertyGrid.vue";
import EventLog from "./common/EventLog.vue";
import ToastList from "./common/ToastList.vue";

const props = withDefaults(
  defineProps<{
    /** Factory so each app shell owns exactly one transport instance. */
    transportFactory: () => Transport;
    /** Server URL pre-filled in the connection bar. */
    initialUrl?: string;
    /** Connect automatically on mount (browser app persists this choice). */
    autoConnect?: boolean;
    /** Called after a successful connection (used by the browser app to remember the URL). */
    onConnected?: (info: { url: string }) => void;
  }>(),
  { initialUrl: "", autoConnect: false, onConnected: undefined },
);

const store = useInspector({
  transportFactory: props.transportFactory,
  initialUrl: props.initialUrl,
  autoConnect: props.autoConnect,
});

const { status, gameInfo, tree, selectedId, detail, url, toasts, log, logVisible } = store;

async function handleConnect(targetUrl: string): Promise<void> {
  await store.connect(targetUrl);
  if (store.status.value === "connected") {
    props.onConnected?.({ url: targetUrl });
  }
}
</script>

<template>
  <div class="ji-app">
    <ConnectionBar
      :status="status"
      :game-info="gameInfo"
      :url="url"
      :log-visible="logVisible"
      @connect="handleConnect"
      @disconnect="store.disconnect"
      @refresh="store.refreshTree"
      @toggle-log="store.toggleLog"
    />
    <div class="ji-app__body">
      <NodeTree :root="tree" :selected-id="selectedId" @select="store.selectNode" />
      <PropertyGrid :detail="detail" @update="store.onUpdate" @commit="store.onCommit" />
    </div>
    <EventLog :visible="logVisible" :log="log" :on-clear="store.clearLog" :on-close="store.toggleLog" />
    <ToastList :toasts="toasts" @dismiss="store.dismissToast" />
  </div>
</template>
