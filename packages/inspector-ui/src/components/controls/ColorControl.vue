<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { color, type ColorValue, type TaggedValue } from "@just-inspector/protocol";

/**
 * Collapsible color picker: a swatch button toggles an inline panel with an
 * SV square, hue / alpha progress-bar sliders, and hex + RGB inputs.
 */

const props = defineProps<{
  modelValue: ColorValue;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const open = ref(false);

// HSV state (h 0-360, s/v 0-1, a 0-1); synced from the authoritative RGB value.
const h = ref(0);
const s = ref(0);
const v = ref(1);
const a = ref(1);
const dragging = ref(false);

/* ------------------------------ conversions ------------------------------ */

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const sat = max === 0 ? 0 : d / max;
  return [hue, sat, max];
}

function hsvToRgb(hue: number, sat: number, val: number): [number, number, number] {
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

const rgb = computed<[number, number, number]>(() => hsvToRgb(h.value, s.value, v.value));
const hex = computed(() => {
  const [r, g, b] = rgb.value.map((n) => Math.round(n * 255));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
});

watch(
  () => props.modelValue,
  (c) => {
    if (dragging.value) return;
    const [hh, ss, vv] = rgbToHsv(c.r, c.g, c.b);
    h.value = hh;
    s.value = ss;
    v.value = vv;
    a.value = c.a;
  },
  { deep: true, immediate: true },
);

/* -------------------------------- emitting ------------------------------- */

function emitValue(commit: boolean): void {
  const [r, g, b] = rgb.value;
  const value = color(r, g, b, a.value);
  emit("update", value, !commit);
  if (commit) emit("commit", value);
}

function beginDrag(): void {
  dragging.value = true;
}

function endDrag(): void {
  if (!dragging.value) return;
  dragging.value = false;
  emitValue(true);
}

/* ------------------------------ pointer math ----------------------------- */

function ratio(e: PointerEvent, el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
}

function onSvPointerDown(e: PointerEvent): void {
  if (props.readOnly) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  beginDrag();
  updateSv(e);
}

function updateSv(e: PointerEvent): void {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  s.value = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
  v.value = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / Math.max(rect.height, 1)));
  emitValue(false);
}

function onHuePointerDown(e: PointerEvent): void {
  if (props.readOnly) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  beginDrag();
  h.value = ratio(e, e.currentTarget as HTMLElement) * 360;
  emitValue(false);
}

function onHuePointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  h.value = ratio(e, e.currentTarget as HTMLElement) * 360;
  emitValue(false);
}

function onAlphaPointerDown(e: PointerEvent): void {
  if (props.readOnly) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  beginDrag();
  a.value = ratio(e, e.currentTarget as HTMLElement);
  emitValue(false);
}

function onAlphaPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  a.value = ratio(e, e.currentTarget as HTMLElement);
  emitValue(false);
}

/* -------------------------------- inputs --------------------------------- */

function onHexCommit(e: Event): void {
  const raw = (e.target as HTMLInputElement).value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return;
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const [hh, ss, vv] = rgbToHsv(r, g, b);
  h.value = hh;
  s.value = ss;
  v.value = vv;
  emitValue(true);
}

function onRgbInput(channel: 0 | 1 | 2, e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(n)) return;
  const next = [...rgb.value] as [number, number, number];
  next[channel] = Math.min(1, Math.max(0, n / 255));
  const [hh, ss, vv] = rgbToHsv(next[0], next[1], next[2]);
  h.value = hh;
  s.value = ss;
  v.value = vv;
  emitValue(true);
}

function onAlphaInput(e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) {
    a.value = Math.min(1, Math.max(0, n));
    emitValue(true);
  }
}

const svStyle = computed(() => ({
  background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h.value} 100% 50%))`,
}));

const hueStyle = computed(() => ({
  background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
}));

const alphaStyle = computed(() => {
  const [r, g, b] = rgb.value.map((n) => Math.round(n * 255));
  return { background: `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b}))` };
});

function swatchStyle(): Record<string, string> {
  const { r, g, b } = props.modelValue;
  return { background: `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})` };
}
</script>

<template>
  <div class="ji-color">
    <div class="ji-color__row">
      <button
        class="ji-color__swatch"
        :class="{ 'is-open': open }"
        :disabled="readOnly"
        :title="open ? 'Collapse color picker' : 'Expand color picker'"
        :style="swatchStyle()"
        @click="open = !open"
      ></button>
      <input class="ji-input ji-color__hex" :value="hex" spellcheck="false" @change="onHexCommit" />
      <button class="ji-btn ji-color__toggle" :disabled="readOnly" @click="open = !open">
        {{ open ? "▴" : "▾" }}
      </button>
    </div>

    <div v-if="open" class="ji-color__panel">
      <div class="ji-color__sv" :style="svStyle" @pointerdown="onSvPointerDown" @pointermove="updateSv" @pointerup="endDrag" @pointercancel="endDrag">
        <div class="ji-color__sv-dot" :style="{ left: s * 100 + '%', top: (1 - v) * 100 + '%' }"></div>
      </div>

      <label class="ji-color__track-row">
        <span class="ji-color__track-label">H</span>
        <div class="ji-color__track" :style="hueStyle" @pointerdown="onHuePointerDown" @pointermove="onHuePointerMove" @pointerup="endDrag" @pointercancel="endDrag">
          <div class="ji-color__track-thumb" :style="{ left: (h / 360) * 100 + '%' }"></div>
        </div>
      </label>

      <label class="ji-color__track-row">
        <span class="ji-color__track-label">A</span>
        <div class="ji-color__track" :style="alphaStyle" @pointerdown="onAlphaPointerDown" @pointermove="onAlphaPointerMove" @pointerup="endDrag" @pointercancel="endDrag">
          <div class="ji-color__track-thumb" :style="{ left: a * 100 + '%' }"></div>
        </div>
      </label>

      <div class="ji-color__inputs">
        <label v-for="(label, i) in ['R', 'G', 'B']" :key="label" class="ji-color__input">
          <span>{{ label }}</span>
          <input class="ji-input" type="number" min="0" max="255" :value="Math.round(rgb[i] * 255)" @change="onRgbInput(i as 0 | 1 | 2, $event)" />
        </label>
        <label class="ji-color__input">
          <span>A</span>
          <input class="ji-input" type="number" min="0" max="1" step="0.01" :value="a.toFixed(2)" @change="onAlphaInput" />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ji-color {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ji-color__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ji-color__swatch {
  flex: none;
  width: 30px;
  height: 22px;
  border-radius: var(--ji-radius);
  border: 1px solid var(--ji-border-strong);
  cursor: pointer;
  padding: 0;
}

.ji-color__swatch.is-open {
  outline: 2px solid var(--ji-accent);
  outline-offset: 1px;
}

.ji-color__hex {
  flex: 1;
  min-width: 0;
  font-family: var(--ji-mono);
}

.ji-color__toggle {
  flex: none;
  padding: 2px 8px;
}

.ji-color__panel {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px;
  border: 1px solid var(--ji-border);
  border-radius: var(--ji-radius);
  background: var(--ji-bg-alt);
}

.ji-color__sv {
  position: relative;
  height: 110px;
  border-radius: var(--ji-radius);
  border: 1px solid var(--ji-border);
  cursor: crosshair;
  touch-action: none;
}

.ji-color__sv-dot {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.ji-color__track-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ji-color__track-label {
  flex: none;
  width: 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ji-text-dim);
  text-align: center;
}

.ji-color__track {
  position: relative;
  flex: 1;
  height: 12px;
  border-radius: 6px;
  border: 1px solid var(--ji-border);
  cursor: pointer;
  touch-action: none;
}

.ji-color__track-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid var(--ji-accent);
  transform: translate(-50%, -50%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.ji-color__inputs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ji-color__input {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--ji-text-dim);
}

.ji-color__input .ji-input {
  width: 52px;
  padding: 1px 4px;
  font-variant-numeric: tabular-nums;
}
</style>
