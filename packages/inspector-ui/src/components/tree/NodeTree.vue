<script setup lang="ts">
import { ref } from "vue";
import type { TreeNode } from "@just-inspector/protocol";
import TreeNodeItem from "./TreeNodeItem.vue";

defineProps<{
  root: TreeNode | null;
  selectedId: string | null;
}>();

const emit = defineEmits<{ select: [id: string] }>();

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
</script>

<template>
  <div class="ji-tree">
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

.ji-tree__bar {
  padding: 6px 8px;
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
