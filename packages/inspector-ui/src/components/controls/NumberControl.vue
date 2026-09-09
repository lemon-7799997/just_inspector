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

/** Draft text while the field is focused. The model only overwrites the
 *  draft on blur/Enter — typing is never clamped or overwritten mid-edit. */
const editing = ref(false);
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
    if (!editing.value) text.value = fmt(v);
  },
);

function onFocus(): void {
  if (props.readOnly) return;
  editing.value = true;
}

/** Keep the raw draft only — no clamp while editing. */
function onInput(e: Event): void {
  if (!editing.value) return;
  text.value = (e.target as HTMLInputElement).value;
}

/** Clamp + truncate once, on blur / Enter / change — never mid-edit. */
function commit(): void {
  if (!editing.value) return;
  editing.value = false;
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
    :step="hint?.step ?? (modelValue.type === 'int' ? 1 : 0.1)"
    @focus="onFocus"
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
