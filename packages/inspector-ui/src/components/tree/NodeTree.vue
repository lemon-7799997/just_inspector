<script setup lang="ts">
import { ref } from "vue";
import type { TreeNode } from "@just-inspector/protocol";
import type { TreeDockPosition } from "../../composables/persistence";
import TreeNodeItem from "./TreeNodeItem.vue";

defineProps<{
  root: TreeNode | null;
  selectedId: string | null;
  /** Current dock position (persisted by the app shell). */
  dock: TreeDockPosition;
}>();

const emit = defineEmits<{
  select: [id: string];
  dockChange: [dock: TreeDockPosition];
}>();

const filter = ref("");
const expanded = ref<Set<string>>(new Set());

function toggle(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expanded.value = next;
}

function select(id: string): void {
  emit("select", id);
}

const dockButtons: Array<{ pos: TreeDockPosition; title: string; icon: string }> = [
  { pos: "left", title: "Dock left", icon: "dock-left" },
  { pos: "bottom", title: "Dock bottom", icon: "dock-bottom" },
  { pos: "right", title: "Dock right", icon: "dock-right" },
];
</script>

<template>
  <div class="ji-tree">
    <div class="ji-tree__toolbar">
      <button
        v-for="b in dockButtons"
        :key="b.pos"
        class="ji-btn ji-tree__dock"
        :class="{ 'is-active': dock === b.pos }"
        :title="b.title"
        @click="emit('dockChange', b.pos)"
      >
        <svg v-if="b.icon === 'dock-left'" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" />
          <rect x="2" y="2" width="4" height="12" rx="1" fill="currentColor" />
        </svg>
        <svg v-else-if="b.icon === 'dock-bottom'" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" />
          <rect x="2" y="10" width="12" height="4" rx="1" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" />
          <rect x="10" y="2" width="4" height="12" rx="1" fill="currentColor" />
        </svg>
      </button>
      <span class="ji-tree__spacer"></span>
      <span class="ji-tree__hint">Tree</span>
    </div>
    <div class="ji-tree__bar">
      <input v-model="filter" class="ji-input" type="search" placeholder="Filter nodes…" spellcheck="false" />
    </div>
    <div class="ji-tree__list">
      <TreeNodeItem
        v-if="root"
        :node="root"
        :depth="0"
        :selected-id="selectedId"
        :expanded="expanded"
        :filter="filter"
        @select="select"
        @toggle="toggle"
      />
      <div v-else class="ji-tree__empty">No scene tree. Connect to a game first.</div>
    </div>
  </div>
</template>

<style scoped>
.ji-tree {
  flex: 0 0 280px;
  min-width: 180px;
  max-width: 45%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--ji-border);
  background: var(--ji-bg-alt);
}

.ji-tree__toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px 0;
  flex: none;
}

.ji-tree__dock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  color: var(--ji-text-dim);
  border-color: var(--ji-border);
}

.ji-tree__dock:hover {
  color: var(--ji-text);
}

.ji-tree__dock.is-active {
  color: var(--ji-accent);
  border-color: var(--ji-accent);
  background: var(--ji-accent-dim);
}

.ji-tree__spacer {
  flex: 1;
}

.ji-tree__hint {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--ji-text-dim);
}

.ji-tree__bar {
  padding: 5px 8px;
  border-bottom: 1px solid var(--ji-border);
  flex: none;
}

.ji-tree__list {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
}

.ji-tree__empty {
  padding: 16px;
  font-size: 12px;
  color: var(--ji-text-dim);
}
</style>
