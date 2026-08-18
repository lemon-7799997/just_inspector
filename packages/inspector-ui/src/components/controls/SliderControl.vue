<script setup lang="ts">
import { computed, ref, watch } from "vue";
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

const track = ref<HTMLElement | null>(null);
const dragging = ref(false);
/** Local value while dragging (props lag behind the live emits). */
const display = ref(props.modelValue.value);

const min = computed(() => props.hint?.min ?? 0);
const max = computed(() => props.hint?.max ?? 1);
const step = computed(() => props.hint?.step ?? (props.modelValue.type === "int" ? 1 : Math.max((max.value - min.value) / 100, 0.001)));
const isInt = computed(() => props.modelValue.type === "int");
const current = computed(() => (dragging.value ? display.value : props.modelValue.value));

const pct = computed(() => {
  const span = max.value - min.value;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((current.value - min.value) / span) * 100));
});

watch(
  () => props.modelValue.value,
  (v) => {
    if (!dragging.value) display.value = v;
  },
);

function clamp(n: number): number {
  return Math.min(max.value, Math.max(min.value, n));
}

function quantize(n: number): number {
  let v = clamp(n);
  if (step.value > 0) v = Math.round(v / step.value) * step.value;
  return isInt.value ? Math.round(v) : v;
}

function make(n: number): IntValue | FloatValue {
  return isInt.value ? int(n) : float(n);
}

function valueFromPointer(e: PointerEvent | MouseEvent): number {
  const el = track.value;
  if (!el) return display.value;
  const rect = el.getBoundingClientRect();
  const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
  return quantize(min.value + t * (max.value - min.value));
}

function setValue(v: number, live: boolean, commit = false): void {
  display.value = v;
  const value = make(v);
  emit("update", value, live);
  if (commit) emit("commit", value);
}

function onPointerDown(e: PointerEvent): void {
  if (props.readOnly) return;
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  setValue(valueFromPointer(e), true);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  setValue(valueFromPointer(e), true);
}

function onPointerUp(): void {
  if (!dragging.value) return;
  dragging.value = false;
  setValue(display.value, false, true);
}

function onKeyDown(e: KeyboardEvent): void {
  if (props.readOnly) return;
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
  e.preventDefault();
  if (e.key === "Home") setValue(min.value, true, true);
  else if (e.key === "End") setValue(max.value, true, true);
  else {
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const factor = e.shiftKey ? 10 : 1;
    setValue(quantize(display.value + dir * step.value * factor), true, true);
  }
}

function onNumberInput(e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) setValue(quantize(n), true);
}

function onNumberCommit(e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) setValue(quantize(n), false, true);
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
}
</script>

<template>
  <div class="ji-slider">
    <div
      ref="track"
      class="ji-slider__track"
      :class="{ 'is-disabled': readOnly }"
      role="slider"
      tabindex="0"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="current"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeyDown"
    >
      <div class="ji-slider__fill" :style="{ width: pct + '%' }"></div>
      <div class="ji-slider__thumb" :style="{ left: pct + '%' }"></div>
    </div>
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

.ji-slider__track {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 12px;
  border-radius: 6px;
  background: var(--ji-bg-input);
  border: 1px solid var(--ji-border);
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.ji-slider__track.is-disabled {
  opacity: 0.55;
  cursor: default;
}

.ji-slider__track:focus-visible {
  outline: 2px solid var(--ji-accent);
  outline-offset: 1px;
}

.ji-slider__fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 6px;
  background: var(--ji-accent);
  opacity: 0.85;
  pointer-events: none;
}

.ji-slider__thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid var(--ji-accent);
  transform: translate(-50%, -50%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.ji-slider__number {
  width: 88px;
  flex: none;
  font-variant-numeric: tabular-nums;
}
</style>
