<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { LogEntry } from "../../composables/useInspector";

const props = defineProps<{
  visible: boolean;
  log: LogEntry[];
  onClear: () => void;
  onClose: () => void;
}>();

const listEl = ref<HTMLElement | null>(null);

watch(
  () => props.log.length,
  () => {
    void nextTick(() => {
      if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
    });
  },
);

function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
</script>

<template>
  <div v-if="visible" class="ji-log">
    <div class="ji-log__bar">
      <span>Protocol frames</span>
      <div class="ji-log__actions">
        <button class="ji-btn" @click="onClear">Clear</button>
        <button class="ji-btn" @click="onClose">Hide</button>
      </div>
    </div>
    <div ref="listEl" class="ji-log__list">
      <div v-for="(e, i) in log" :key="i" class="ji-log__row">
        <span class="ji-log__time">{{ fmtTime(e.at) }}</span>
        <span class="ji-log__dir" :class="e.dir === 'in' ? 'is-in' : 'is-out'">{{ e.dir === "in" ? "←" : "→" }}</span>
        <span class="ji-log__text">{{ e.text }}</span>
      </div>
      <div v-if="log.length === 0" class="ji-log__empty">No frames yet.</div>
    </div>
  </div>
</template>

<style scoped>
.ji-log {
  display: flex;
  flex-direction: column;
  height: 180px;
  border-top: 1px solid var(--ji-border);
  background: #171717;
}

.ji-log__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ji-text-dim);
  border-bottom: 1px solid var(--ji-border);
}

.ji-log__actions {
  display: flex;
  gap: 6px;
}

.ji-log__list {
  flex: 1;
  overflow: auto;
  padding: 4px 8px;
  font-family: var(--ji-mono);
  font-size: 11px;
}

.ji-log__row {
  display: flex;
  gap: 8px;
  padding: 1px 0;
  white-space: nowrap;
}

.ji-log__time {
  color: var(--ji-text-dim);
}

.ji-log__dir.is-in {
  color: var(--ji-ok);
}

.ji-log__dir.is-out {
  color: var(--ji-accent);
}

.ji-log__text {
  color: var(--ji-text);
  overflow: hidden;
  text-overflow: ellipsis;
}

.ji-log__empty {
  color: var(--ji-text-dim);
  padding: 8px;
}
</style>
