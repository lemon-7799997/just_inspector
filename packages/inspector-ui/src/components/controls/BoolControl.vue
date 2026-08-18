<script setup lang="ts">
import { bool, type BoolValue, type TaggedValue } from "@just-inspector/protocol";

const props = defineProps<{
  modelValue: BoolValue;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

function onChange(e: Event): void {
  const v = (e.target as HTMLInputElement).checked;
  emit("commit", bool(v));
}
</script>

<template>
  <label class="ji-check">
    <input type="checkbox" :checked="modelValue.value" :disabled="readOnly" @change="onChange" />
    <span class="ji-check__box"></span>
  </label>
</template>

<style scoped>
.ji-check {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  padding: 2px 0;
}

.ji-check input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.ji-check__box {
  width: 16px;
  height: 16px;
  border: 1px solid var(--ji-border-strong);
  border-radius: 3px;
  background: var(--ji-bg-input);
  position: relative;
  transition: background 0.12s ease;
}

.ji-check input:checked + .ji-check__box {
  background: var(--ji-accent);
  border-color: var(--ji-accent);
}

.ji-check input:checked + .ji-check__box::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid #101010;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.ji-check input:disabled + .ji-check__box {
  opacity: 0.5;
  cursor: default;
}
</style>
