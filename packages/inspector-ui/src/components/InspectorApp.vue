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

const { status, gameInfo, tree, selectedId, detail, url, toasts, log, logVisible, treeDock, prettyNames } = store;

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
      :pretty-names="prettyNames"
      @connect="handleConnect"
      @disconnect="store.disconnect"
      @refresh="store.refreshTree"
      @toggle-log="store.toggleLog"
      @pretty-names-change="store.setPrettyNames"
    />
    <div class="ji-app__body" :class="`is-dock-${treeDock}`">
      <NodeTree
        :root="tree"
        :selected-id="selectedId"
        :dock="treeDock"
        @select="store.selectNode"
        @dock-change="store.setTreeDock"
      />
      <PropertyGrid
        :detail="detail"
        :pretty-names="prettyNames"
        @update="store.onUpdate"
        @commit="store.onCommit"
      />
    </div>
    <EventLog :visible="logVisible" :log="log" :on-clear="store.clearLog" :on-close="store.toggleLog" />
    <ToastList :toasts="toasts" @dismiss="store.dismissToast" />
  </div>
</template>

<style scoped>
.ji-app__body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* --- tree dock positions (persisted; default = left) ------------------- */

.ji-app__body.is-dock-left {
  flex-direction: row;
}

.ji-app__body.is-dock-right {
  flex-direction: row-reverse;
}

.ji-app__body.is-dock-top {
  flex-direction: column;
}

.ji-app__body.is-dock-right :deep(.ji-tree) {
  border-right: none;
  border-left: 1px solid var(--ji-border);
}

/* Vertical layout: the tree is a fixed-height strip above the property grid
   (hence "Dock top"), so the divider belongs on its bottom edge. */
.ji-app__body.is-dock-top :deep(.ji-tree) {
  flex: none;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 220px;
  border-right: none;
  border-bottom: 1px solid var(--ji-border);
}
</style>
