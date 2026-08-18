<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { curve, type CurvePoint, type CurveValue, type PropertyHint, type TaggedValue } from "@just-inspector/protocol";

/**
 * Curve editor — canvas based, dependency-free.
 *
 * Interaction:
 *   - click empty space  -> add a point (x stays monotonic)
 *   - drag a point       -> move it (x clamped between neighbours)
 *   - drag the yellow handles (bezier mode) -> edit tangents
 *   - double-click a point -> remove it
 *   - select a point and press Delete -> remove it
 *
 * Emits `update(value, live=true)` while dragging and `commit(value)` on
 * pointer-up / add / remove / reset / mode change.
 */

const props = defineProps<{
  modelValue: CurveValue;
  hint?: PropertyHint;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const points = ref<CurvePoint[]>(clonePoints(props.modelValue.points));
const mode = ref<"bezier" | "linear">(props.modelValue.mode ?? "bezier");
const selected = ref(-1);
const dragging = ref<{ kind: "point" | "left" | "right"; index: number } | null>(null);

const timeMin = computed(() => props.hint?.timeMin ?? 0);
const timeMax = computed(() => props.hint?.timeMax ?? 1);
const valueMin = computed(() => props.hint?.valueMin ?? 0);
const valueMax = computed(() => props.hint?.valueMax ?? 1);
const editable = computed(() => !props.readOnly && (props.hint?.curveEditable ?? true));
const MAX_POINTS = 16;
const EPS = 0.0001;

function clonePoints(pts: CurvePoint[]): CurvePoint[] {
  return pts.map((p) => ({ ...p }));
}

watch(
  () => props.modelValue,
  (v) => {
    if (!dragging.value) {
      points.value = clonePoints(v.points);
      mode.value = v.mode ?? "bezier";
    }
  },
  { deep: true },
);

watch(mode, () => {
  if (mode.value === "linear") selected.value = -1;
  emitValue(true, true);
});

function emitValue(live: boolean, commit = false): void {
  const v = curve(points.value, mode.value);
  emit("update", v, live);
  if (commit) emit("commit", v);
}

/* --------------------------- coordinate mapping --------------------------- */

function mapX(x: number): number {
  const w = canvas.value?.clientWidth ?? 200;
  return ((x - timeMin.value) / (timeMax.value - timeMin.value)) * w;
}

function mapY(y: number): number {
  const h = canvas.value?.clientHeight ?? 120;
  return h - ((y - valueMin.value) / (valueMax.value - valueMin.value)) * h;
}

function unmapX(px: number): number {
  const w = canvas.value?.clientWidth ?? 200;
  return timeMin.value + (px / w) * (timeMax.value - timeMin.value);
}

function unmapY(py: number): number {
  const h = canvas.value?.clientHeight ?? 120;
  return valueMax.value - (py / h) * (valueMax.value - valueMin.value);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/* --------------------------------- drawing -------------------------------- */

function draw(): void {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
  if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = "#e5e5ea";
  ctx.lineWidth = 1;
  for (let t = 0; t <= 10; t++) {
    const gx = (t / 10) * w;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
    const gy = (t / 10) * h;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  // axis frame
  ctx.strokeStyle = "#c9c9d1";
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  const pts = points.value;
  if (pts.length === 0) return;

  // curve
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (mode.value === "linear" || pts.length === 1) {
    ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(mapX(pts[i].x), mapY(pts[i].y));
  } else {
    ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const n = pts[i + 1];
      ctx.bezierCurveTo(mapX(p.x + p.rx), mapY(p.y + p.ry), mapX(n.x + n.lx), mapY(n.y + n.ly), mapX(n.x), mapY(n.y));
    }
  }
  ctx.stroke();

  // points + tangent handles
  pts.forEach((p, i) => {
    const px = mapX(p.x);
    const py = mapY(p.y);
    const isSel = selected.value === i;

    if (mode.value === "bezier" && isSel && editable.value) {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(mapX(p.x + p.rx), mapY(p.y + p.ry));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(mapX(p.x + p.lx), mapY(p.y + p.ly));
      ctx.stroke();
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(mapX(p.x + p.rx) - 3.5, mapY(p.y + p.ry) - 3.5, 7, 7);
      ctx.fillRect(mapX(p.x + p.lx) - 3.5, mapY(p.y + p.ly) - 3.5, 7, 7);
    }

    ctx.beginPath();
    ctx.arc(px, py, isSel ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? "#f59e0b" : "#52525b";
    ctx.fill();
    if (isSel) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

function onResize(): void {
  draw();
}

watchEffect(() => {
  draw();
});
onMounted(() => {
  draw();
  window.addEventListener("resize", onResize);
});
onUnmounted(() => {
  window.removeEventListener("resize", onResize);
});

/* -------------------------------- hit test -------------------------------- */

function hitTest(px: number, py: number): { kind: "point" | "left" | "right"; index: number } | null {
  const R = 8;
  if (mode.value === "bezier" && selected.value >= 0) {
    const p = points.value[selected.value];
    if (p) {
      const hx = mapX(p.x + p.rx);
      const hy = mapY(p.y + p.ry);
      if (Math.abs(px - hx) < R && Math.abs(py - hy) < R) return { kind: "right", index: selected.value };
      const lx = mapX(p.x + p.lx);
      const ly = mapY(p.y + p.ly);
      if (Math.abs(px - lx) < R && Math.abs(py - ly) < R) return { kind: "left", index: selected.value };
    }
  }
  for (let i = points.value.length - 1; i >= 0; i--) {
    const p = points.value[i];
    if (Math.abs(px - mapX(p.x)) < R && Math.abs(py - mapY(p.y)) < R) return { kind: "point", index: i };
  }
  return null;
}

function insertionIndex(x: number): number {
  for (let i = 0; i < points.value.length; i++) {
    if (points.value[i].x >= x) return i;
  }
  return points.value.length;
}

/* ------------------------------- interaction ------------------------------ */

function canvasPos(e: PointerEvent | MouseEvent): { px: number; py: number } {
  const rect = (canvas.value as HTMLCanvasElement).getBoundingClientRect();
  return { px: e.clientX - rect.left, py: e.clientY - rect.top };
}

function onPointerDown(e: PointerEvent): void {
  if (!editable.value) return;
  const { px, py } = canvasPos(e);
  const hit = hitTest(px, py);
  const cv = canvas.value as HTMLCanvasElement;
  if (hit) {
    dragging.value = hit;
    selected.value = hit.index;
    cv.setPointerCapture(e.pointerId);
    emitValue(true);
    return;
  }
  if (points.value.length >= MAX_POINTS) return;
  const x = clamp(unmapX(px), timeMin.value, timeMax.value);
  const y = clamp(unmapY(py), valueMin.value, valueMax.value);
  const idx = insertionIndex(x);
  points.value.splice(idx, 0, { x, y, lx: -0.2, ly: 0, rx: 0.2, ry: 0 });
  selected.value = idx;
  dragging.value = { kind: "point", index: idx };
  cv.setPointerCapture(e.pointerId);
  emitValue(true);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  const { px, py } = canvasPos(e);
  const pts = points.value;
  const { kind, index } = dragging.value;
  const p = pts[index];
  if (!p) return;
  if (kind === "point") {
    const prev = pts[index - 1];
    const next = pts[index + 1];
    const minX = prev ? prev.x + EPS : timeMin.value;
    const maxX = next ? next.x - EPS : timeMax.value;
    p.x = clamp(unmapX(px), minX, maxX);
    p.y = clamp(unmapY(py), valueMin.value, valueMax.value);
  } else if (kind === "right") {
    p.rx = unmapX(px) - p.x;
    p.ry = unmapY(py) - p.y;
  } else {
    p.lx = unmapX(px) - p.x;
    p.ly = unmapY(py) - p.y;
  }
  draw();
  emitValue(true);
}

function onPointerUp(): void {
  if (dragging.value) {
    dragging.value = null;
    emitValue(false, true);
  }
}

function onDblClick(e: MouseEvent): void {
  if (!editable.value) return;
  const { px, py } = canvasPos(e);
  const hit = hitTest(px, py);
  if (hit && points.value.length > 1) {
    points.value.splice(hit.index, 1);
    selected.value = -1;
    emitValue(false, true);
  }
}

function removeSelected(): void {
  if (!editable.value || selected.value < 0 || points.value.length <= 1) return;
  points.value.splice(selected.value, 1);
  selected.value = -1;
  emitValue(false, true);
}

function addPoint(): void {
  if (!editable.value || points.value.length >= MAX_POINTS) return;
  const last = points.value[points.value.length - 1];
  const span = timeMax.value - timeMin.value;
  const x = clamp(last ? last.x + span / 8 : timeMin.value, timeMin.value, timeMax.value);
  const y = (valueMin.value + valueMax.value) / 2;
  const idx = insertionIndex(x);
  points.value.splice(idx, 0, { x, y, lx: -0.2, ly: 0, rx: 0.2, ry: 0 });
  selected.value = idx;
  emitValue(true, true);
}

function reset(): void {
  if (!editable.value) return;
  const spanT = timeMax.value - timeMin.value;
  const spanV = valueMax.value - valueMin.value;
  points.value = [
    { x: timeMin.value, y: valueMin.value, lx: 0, ly: 0, rx: spanT / 2, ry: 0 },
    { x: timeMax.value, y: valueMax.value, lx: -spanT / 2, ly: 0, rx: 0, ry: 0 },
  ];
  selected.value = -1;
  emitValue(true, true);
}

const selectedPoint = computed<CurvePoint | null>(() => (selected.value >= 0 ? points.value[selected.value] ?? null : null));

function onPointField(field: "x" | "y", value: string): void {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  const idx = selected.value;
  const p = points.value[idx];
  if (!p) return;
  if (field === "x") {
    const prev = points.value[idx - 1];
    const next = points.value[idx + 1];
    p.x = clamp(n, prev ? prev.x + EPS : timeMin.value, next ? next.x - EPS : timeMax.value);
  } else {
    p.y = clamp(n, valueMin.value, valueMax.value);
  }
  emitValue(true, true);
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, "");
}
</script>

<template>
  <div class="ji-curve">
    <canvas
      ref="canvas"
      class="ji-curve__canvas"
      :class="{ 'is-editable': editable }"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDblClick"
      @keydown.delete.prevent="removeSelected"
    ></canvas>
    <div v-if="selectedPoint" class="ji-curve__fields">
      <label class="ji-curve__field">
        <span>X</span>
        <input
          class="ji-input"
          type="number"
          :step="(timeMax - timeMin) / 100"
          :value="fmt(selectedPoint.x)"
          @change="onPointField('x', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="ji-curve__field">
        <span>Y</span>
        <input
          class="ji-input"
          type="number"
          :step="(valueMax - valueMin) / 100"
          :value="fmt(selectedPoint.y)"
          @change="onPointField('y', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <div class="ji-curve__toolbar">
      <select v-model="mode" class="ji-input ji-curve__mode" :disabled="!editable">
        <option value="bezier">Bezier</option>
        <option value="linear">Linear</option>
      </select>
      <button class="ji-btn" :disabled="!editable" title="Add point" @click="addPoint">+</button>
      <button class="ji-btn" :disabled="!editable || !selectedPoint" title="Remove selected point (or double-click it)" @click="removeSelected">−</button>
      <button class="ji-btn" :disabled="!editable" title="Reset to linear ramp" @click="reset">reset</button>
    </div>
  </div>
</template>

<style scoped>
.ji-curve {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ji-curve__canvas {
  width: 100%;
  height: 130px;
  border-radius: var(--ji-radius);
  border: 1px solid var(--ji-border);
  outline: none;
  touch-action: none;
  cursor: default;
}

.ji-curve__canvas.is-editable {
  cursor: crosshair;
}

.ji-curve__canvas:focus {
  border-color: var(--ji-accent);
}

.ji-curve__fields {
  display: flex;
  gap: 10px;
}

.ji-curve__field {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--ji-text-dim);
}

.ji-curve__field .ji-input {
  width: 76px;
  padding: 1px 4px;
  font-variant-numeric: tabular-nums;
}

.ji-curve__toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
}

.ji-curve__mode {
  width: 92px;
}
</style>
