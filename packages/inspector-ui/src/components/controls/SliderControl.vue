<script setup lang="ts">
import { computed } from "vue";
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

const min = computed(() => props.hint?.min ?? 0);
const max = computed(() => props.hint?.max ?? 1);
const step = computed(() => props.hint?.step ?? (props.modelValue.type === "int" ? 1 : Math.max((max.value - min.value) / 100, 0.001)));
const isInt = computed(() => props.modelValue.type === "int");
const current = computed(() => props.modelValue.value);

function make(n: number): IntValue | FloatValue {
  const v = Math.min(max.value, Math.max(min.value, n));
  return isInt.value ? int(v) : float(v);
}

function onRangeInput(e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("update", make(n), true);
}

function onRangeCommit(e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("commit", make(n));
}

function onNumberInput(e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("update", make(n), true);
}

function onNumberCommit(e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("commit", make(n));
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
}
</script>

<template>
  <div class="ji-slider">
    <input
      class="ji-slider__range"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="current"
      :disabled="readOnly"
      @input="onRangeInput"
      @change="onRangeCommit"
    />
    <input
      class="ji-input ji-slider__number"
      type="number"
      :value="fmt(current)"
      :min="min"
      :max="max"
      :step="step"
      :readonly="readOnly"
      @input="onNumberInput"
      @change="onNumberCommit"
      @keydown.enter.prevent="onNumberCommit"
      @blur="onNumberCommit"
    />
  </div>
</template>

<style scoped>
.ji-slider {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ji-slider__range {
  flex: 1;
  min-width: 0;
  accent-color: var(--ji-accent);
  cursor: pointer;
}

.ji-slider__range:disabled {
  cursor: default;
}

.ji-slider__number {
  width: 88px;
  flex: none;
  font-variant-numeric: tabular-nums;
}
</style>
