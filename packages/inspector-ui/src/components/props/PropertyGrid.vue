<script setup lang="ts">
import type { NodeDetail, TaggedValue } from "@just-inspector/protocol";
import PropertyRow from "./PropertyRow.vue";

defineProps<{ detail: NodeDetail | null }>();

const emit = defineEmits<{
  update: [property: string, value: TaggedValue, live: boolean];
  commit: [property: string, value: TaggedValue];
}>();

function onRowUpdate(property: string, value: TaggedValue, live: boolean): void {
  emit("update", property, value, live);
}

function onRowCommit(property: string, value: TaggedValue): void {
  emit("commit", property, value);
}
</script>

<template>
  <div class="ji-grid">
    <template v-if="detail">
      <div class="ji-grid__header">
        <div class="ji-grid__title">
          <span class="ji-grid__name">{{ detail.name }}</span>
          <span v-if="detail.kind" class="ji-grid__kind">{{ detail.kind }}</span>
        </div>
        <div v-if="detail.path" class="ji-grid__path">{{ detail.path }}</div>
      </div>
      <div class="ji-grid__props">
        <PropertyRow
          v-for="p in detail.properties"
          :key="p.name"
          :property="p"
          @update="onRowUpdate"
          @commit="onRowCommit"
        />
        <div v-if="detail.properties.length === 0" class="ji-grid__empty">This node has no inspectable properties.</div>
      </div>
    </template>
    <div v-else class="ji-grid__empty">Select a node in the scene tree to inspect its properties.</div>
  </div>
</template>

<style scoped>
.ji-grid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--ji-bg);
}

.ji-grid__header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--ji-border);
  background: var(--ji-bg-alt);
  flex: none;
}

.ji-grid__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ji-grid__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ji-text-strong);
}

.ji-grid__kind {
  font-size: 11px;
  color: var(--ji-accent);
}

.ji-grid__path {
  margin-top: 2px;
  font-size: 11px;
  font-family: var(--ji-mono);
  color: var(--ji-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ji-grid__props {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}

.ji-grid__empty {
  padding: 24px 16px;
  color: var(--ji-text-dim);
  font-size: 12px;
  text-align: center;
}
</style>
