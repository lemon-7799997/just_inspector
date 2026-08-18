<script setup lang="ts">
import { computed } from "vue";
import type { TreeNode } from "@just-inspector/protocol";
import { kindColor } from "./kindColor";

const props = defineProps<{
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  filter: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  toggle: [id: string];
}>();

const hasChildren = computed(() => !!props.node.children && props.node.children.length > 0);
const isExpanded = computed(() => props.expanded.has(props.node.id));
const isSelected = computed(() => props.node.id === props.selectedId);

function selfMatches(q: string): boolean {
  if (!q) return true;
  return (
    props.node.name.toLowerCase().includes(q) ||
    (props.node.kind ?? "").toLowerCase().includes(q)
  );
}

function descendantMatches(n: TreeNode, q: string): boolean {
  const lq = q.toLowerCase();
  if (n.name.toLowerCase().includes(lq) || (n.kind ?? "").toLowerCase().includes(lq)) return true;
  return (n.children ?? []).some((c) => descendantMatches(c, q));
}

const visible = computed(() => {
  const q = props.filter.trim();
  return selfMatches(q) || (props.node.children ?? []).some((c) => descendantMatches(c, q));
});

function onClick(): void {
  emit("select", props.node.id);
  if (hasChildren.value) emit("toggle", props.node.id);
}
</script>

<template>
  <div>
    <div
      v-if="visible"
      class="ji-node"
      :class="{ 'is-selected': isSelected }"
      :style="{ paddingLeft: `${6 + depth * 14}px` }"
      :title="node.kind ? `${node.kind} (${node.id})` : node.id"
      @click="onClick"
    >
      <span v-if="hasChildren" class="ji-node__arrow" :class="{ 'is-open': isExpanded }">▸</span>
      <span v-else class="ji-node__arrow ji-node__arrow--leaf"></span>
      <span class="ji-node__dot" :style="{ background: kindColor(node.kind) }"></span>
      <span class="ji-node__name">{{ node.name }}</span>
      <span v-if="node.kind && !filter" class="ji-node__kind">{{ node.kind }}</span>
    </div>
    <div v-if="visible && hasChildren && isExpanded">
      <TreeNodeItem
        v-for="child in node.children ?? []"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-id="selectedId"
        :expanded="expanded"
        :filter="filter"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.ji-node {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-top: 2px;
  padding-bottom: 2px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  border-left: 2px solid transparent;
}

.ji-node:hover {
  background: var(--ji-bg-hover);
}

.ji-node.is-selected {
  background: var(--ji-accent-dim);
  border-left-color: var(--ji-accent);
}

.ji-node__arrow {
  flex: none;
  width: 12px;
  font-size: 10px;
  color: var(--ji-text-dim);
  transition: transform 0.1s ease;
  text-align: center;
}

.ji-node__arrow.is-open {
  transform: rotate(90deg);
}

.ji-node__arrow--leaf {
  visibility: hidden;
}

.ji-node__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0.9;
}

.ji-node__name {
  font-size: 12px;
  color: var(--ji-text);
  overflow: hidden;
  text-overflow: ellipsis;
}

.is-selected .ji-node__name {
  color: var(--ji-text-strong);
}

.ji-node__kind {
  font-size: 10px;
  color: var(--ji-text-dim);
  margin-left: auto;
  padding-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
</style>
