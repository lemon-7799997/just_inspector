<script setup lang="ts">
import { ref, watch } from "vue";
import { float, int, type FloatValue, type IntValue, type PropertyHint, type TaggedValue } from "@just-inspector/protocol";

const props = defineProps<{
  modelValue: IntValue | FloatValue;
  hint?: PropertyHint;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const text = ref(fmt(props.modelValue.value));

function fmt(n: number): string {
  return String(n);
}

function isInt(): boolean {
  return props.modelValue.type === "int";
}

function make(n: number): IntValue | FloatValue {
  return isInt() ? int(n) : float(n);
}

function parse(): number | null {
  const n = Number(text.value);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number): number {
  const { min, max } = props.hint ?? {};
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

watch(
  () => props.modelValue.value,
  (v) => {
    text.value = fmt(v);
  },
);

function onInput(): void {
  const n = parse();
  if (n !== null) emit("update", make(isInt() ? Math.trunc(n) : n), false);
}

function commit(): void {
  const n = parse();
  if (n === null) {
    text.value = fmt(props.modelValue.value);
    return;
  }
  const v = make(isInt() ? Math.trunc(clamp(n)) : clamp(n));
  text.value = fmt((v as { value: number }).value);
  emit("commit", v);
}
</script>

<template>
  <input
    class="ji-input ji-number"
    type="number"
    :value="text"
    :readonly="readOnly"
    :min="hint?.min"
    :max="hint?.max"
    :step="hint?.step ?? (modelValue.type === 'int' ? 1 : 'any')"
    @input="onInput"
    @change="commit"
    @keydown.enter.prevent="commit"
    @blur="commit"
  />
</template>

<style scoped>
.ji-number {
  width: 110px;
  font-variant-numeric: tabular-nums;
}
</style>
