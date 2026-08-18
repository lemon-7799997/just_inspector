<script setup lang="ts">
import type { ToastItem } from "../../composables/useInspector";

defineProps<{ toasts: ToastItem[] }>();
const emit = defineEmits<{ dismiss: [id: number] }>();
</script>

<template>
  <div class="ji-toasts" role="status" aria-live="polite">
    <TransitionGroup name="ji-toast">
      <div v-for="t in toasts" :key="t.id" class="ji-toast" :class="`ji-toast--${t.kind}`" @click="emit('dismiss', t.id)">
        <span class="ji-toast__icon">{{ t.kind === "error" ? "✕" : t.kind === "success" ? "✓" : "ℹ" }}</span>
        <span class="ji-toast__text">{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ji-toasts {
  position: fixed;
  top: 42px;
  right: 12px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 380px;
}

.ji-toast {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ji-bg-alt);
  border: 1px solid var(--ji-border-strong);
  border-left: 3px solid var(--ji-accent);
  border-radius: var(--ji-radius);
  box-shadow: var(--ji-shadow);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.ji-toast--success {
  border-left-color: var(--ji-ok);
}
.ji-toast--error {
  border-left-color: var(--ji-danger);
}
.ji-toast--info {
  border-left-color: var(--ji-accent);
}

.ji-toast__icon {
  color: var(--ji-text-dim);
  font-weight: 700;
  line-height: 1.4;
}

.ji-toast__text {
  word-break: break-word;
}

.ji-toast-enter-active,
.ji-toast-leave-active {
  transition: all 0.18s ease;
}

.ji-toast-enter-from,
.ji-toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
