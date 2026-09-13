<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { curve, type CurvePoint, type CurveValue, type PropertyHint, type TaggedValue } from "@just-inspector/protocol";

/**
 * Curve editor — canvas based, dependency-free.
 *
 * Interaction:
 *   - click empty space  -> add a point (x stays monotonic)
 *   - drag a point       -> move it (x clamped between neighbours)
 *   - shift+drag         -> rubber-band select every point inside the band;
 *       the selection's AABB centre is captured once and kept as the pivot for
 *       the X / Y scale sliders
 *   - drag with 2+ selected -> move every selected point together (x and y);
 *       the polyline is re-sorted by x after every move and the selection
 *       follows the *points*, not their indices
 *   - X / Y scale sliders (2+ selected) -> scale the selection around the
 *       captured centre; an x scale re-sorts and re-connects in real time
 *   - drag the yellow handles (bezier mode) -> edit tangents
 *   - right-click a point -> remove it; with a multi-selection, right-click
 *       drops the whole selection instead
 *   - double-click a point -> remove it
 *   - select a point and press Delete -> remove the selection
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

/**
 * Selected points, held **by identity**.
 *
 * A group drag or an x scale re-sorts `points`, so an index-based selection
 * would keep pointing at the old slots and the user would lose what they
 * picked; holding the point objects keeps the same points selected.
 */
const selected = ref<Set<CurvePoint>>(new Set());

const timeMin = computed(() => props.hint?.timeMin ?? 0);
const timeMax = computed(() => props.hint?.timeMax ?? 1);
const valueMin = computed(() => props.hint?.valueMin ?? 0);
const valueMax = computed(() => props.hint?.valueMax ?? 1);
const midValue = computed(() => (valueMin.value + valueMax.value) / 2);
const editable = computed(() => !props.readOnly && (props.hint?.curveEditable ?? true));
const MAX_POINTS = 16;
const EPS = 0.0001;

/* ------------------------------ drawing constants ------------------------- */

const POINT_R = 3.5;
const POINT_R_SELECTED = 5;
/**
 * Padding between the canvas edge and the plot area — one (selected) dot radius
 * plus a hair, so a point sitting exactly on an axis bound is never clipped.
 * The padding ends at the plot frame; the canvas' own CSS border is the outer
 * frame the user sees around the whole editor.
 */
const PAD = POINT_R_SELECTED + 2;
/** Axis labels are vertically centred, so pull their boxes back by half a line
 * (10px font) to line the label centres up with the plot's top / bottom edges. */
const AXIS_LABEL_PAD = Math.max(0, PAD - 5);
const GRID = "#e5e5ea";
const FRAME = "#d4d4d8";
const HANDLE = "#f59e0b";
const POINT = "#52525b";
const CURVE = "#2563eb";

/**
 * Scale sliders (enabled only for a multi-selection).
 *
 * They are **absolute** multipliers of the offsets captured with the selection:
 * `1` is the layout the user selected, `0.5` halves every offset and dragging
 * back to `1` restores it exactly. The minimum is small enough to squeeze a
 * selection onto (almost) one line while still being pullable apart again, and
 * the maximum is twice the captured offsets — past that the axis bounds would
 * clamp the points anyway.
 */
const SCALE_MIN = 0.01;
const SCALE_MAX = 2;
const scaleX = ref(1);
const scaleY = ref(1);
const scaleEnabled = computed(() => editable.value && selected.value.size > 1);

type Drag =
  | { kind: "point" | "left" | "right"; point: CurvePoint; startX: number; startY: number }
  | {
    kind: "group";
    startX: number;
    startY: number;
    /** Started on empty space: a click that never moves adds a point. */
    fromEmpty: boolean;
    moved: boolean;
    origin: { point: CurvePoint; x: number; y: number }[];
    /** The scale base centre as it was when the drag started, so every move can
     * translate it by the *total* delta instead of accumulating. */
    center: { x: number; y: number } | null;
  }
  | {
    /** Shift+drag rubber band; the selection is committed on release. */
    kind: "box";
    startX: number;
    startY: number;
    x: number;
    y: number;
  };

const dragging = ref<Drag | null>(null);

/**
 * Everything the scale sliders need, captured **when the selection is made**:
 * the selection's AABB centre plus each point's offset from it.
 *
 * Keeping the offsets (rather than re-deriving them from the points on every
 * slider event) is what makes the sliders stable: scaling never compounds, a
 * selection squeezed flat can always be pulled apart again, and `1` always
 * means "exactly what I selected". The offsets survive a group move (the centre
 * travels with it) and an echo of our own value; they are re-captured whenever
 * the selection itself changes.
 */
let scaleBase: {
  cx: number;
  cy: number;
  points: { point: CurvePoint; dx: number; dy: number }[];
} | null = null;

const selectedList = computed(() => points.value.filter((p) => selected.value.has(p)));
const selectedPoint = computed<CurvePoint | null>(() =>
  selected.value.size === 1 ? ([...selected.value][0] ?? null) : null,
);
const canRemove = computed(
  () => editable.value && selected.value.size > 0 && points.value.length - selected.value.size >= 1,
);

function clonePoints(pts: CurvePoint[]): CurvePoint[] {
  return pts.map((p) => ({ ...p }));
}

/** Re-derives the scale pivot from the current selection (or drops it). */
/** Captures (or drops) the scale base from the current selection. */
function captureScaleBase(): void {
  const sel = selectedList.value;
  scaleX.value = 1;
  scaleY.value = 1;
  if (sel.length < 2) {
    scaleBase = null;
    return;
  }
  const xs = sel.map((p) => p.x);
  const ys = sel.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  scaleBase = {
    cx,
    cy,
    points: sel.map((p) => ({ point: p, dx: p.x - cx, dy: p.y - cy })),
  };
}

/** Replaces the selection and re-captures the scale base for it. */
function setSelection(pts: CurvePoint[]): void {
  selected.value = new Set(pts);
  captureScaleBase();
}

watch(
  () => props.modelValue,
  (v) => {
    if (dragging.value) return;
    // Keep the selection and the scale base across our own echo
    // (`Runtime.setValue` answers with a normalized copy): the order is exactly
    // what we sent, so both map by index. Without re-mapping, the base would
    // keep pointing at the discarded point objects and the sliders would stop
    // doing anything.
    const selectedIndices = points.value
      .map((p, i) => (selected.value.has(p) ? i : -1))
      .filter((i) => i >= 0);
    const base = scaleBase;
    const baseIndices = base
      ? base.points.map((b) => ({ index: points.value.indexOf(b.point), dx: b.dx, dy: b.dy }))
      : [];
    const baseIntact =
      base !== null &&
      baseIndices.length === selectedIndices.length &&
      baseIndices.every((b) => b.index >= 0);

    points.value = clonePoints(v.points);
    mode.value = v.mode ?? "bezier";
    selected.value = new Set(
      selectedIndices.map((i) => points.value[i]).filter((p) => p !== undefined),
    );

    if (base && baseIntact && selected.value.size > 1) {
      scaleBase = {
        cx: base.cx,
        cy: base.cy,
        points: baseIndices.map((b) => ({ point: points.value[b.index], dx: b.dx, dy: b.dy })),
      };
    } else {
      scaleBase = null;
      scaleX.value = 1;
      scaleY.value = 1;
    }
  },
  { deep: true },
);

watch(mode, () => {
  emitValue(true, true);
});

function emitValue(live: boolean, commit = false): void {
  const v = curve(points.value, mode.value);
  emit("update", v, live);
  if (commit) emit("commit", v);
}

/* --------------------------- coordinate mapping --------------------------- */

interface Plot {
  left: number;
  top: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
}

/** The plot area: the canvas inset by `PAD`, i.e. the rectangle the frame
 * traces. All value <-> pixel mapping goes through it. */
function plotRect(): Plot {
  const w = canvas.value?.clientWidth ?? 200;
  const h = canvas.value?.clientHeight ?? 130;
  const left = Math.min(PAD, w / 2);
  const top = Math.min(PAD, h / 2);
  const right = Math.max(left + 1, w - PAD);
  const bottom = Math.max(top + 1, h - PAD);
  return { left, top, right, bottom, w: right - left, h: bottom - top };
}

function mapX(x: number): number {
  const p = plotRect();
  return p.left + ((x - timeMin.value) / (timeMax.value - timeMin.value)) * p.w;
}

function mapY(y: number): number {
  const p = plotRect();
  return p.bottom - ((y - valueMin.value) / (valueMax.value - valueMin.value)) * p.h;
}

function unmapX(px: number): number {
  const p = plotRect();
  return timeMin.value + ((px - p.left) / p.w) * (timeMax.value - timeMin.value);
}

function unmapY(py: number): number {
  const p = plotRect();
  return valueMax.value - ((py - p.top) / p.h) * (valueMax.value - valueMin.value);
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

  const p = plotRect();

  // Grid inside the plot, then the plot frame: the frame is what separates the
  // padding (where dots may overflow) from the coordinate area.
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let t = 1; t < 10; t++) {
    const gx = p.left + (t / 10) * p.w;
    ctx.beginPath();
    ctx.moveTo(gx, p.top);
    ctx.lineTo(gx, p.bottom);
    ctx.stroke();
    const gy = p.top + (t / 10) * p.h;
    ctx.beginPath();
    ctx.moveTo(p.left, gy);
    ctx.lineTo(p.right, gy);
    ctx.stroke();
  }
  ctx.strokeStyle = FRAME;
  ctx.strokeRect(p.left + 0.5, p.top + 0.5, p.w - 1, p.h - 1);

  const pts = points.value;
  if (pts.length === 0) return;

  // curve
  ctx.strokeStyle = CURVE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));
  if (mode.value === "linear" || pts.length === 1) {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(mapX(pts[i].x), mapY(pts[i].y));
  } else {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      ctx.bezierCurveTo(
        mapX(a.x + a.rx),
        mapY(a.y + a.ry),
        mapX(b.x + b.lx),
        mapY(b.y + b.ly),
        mapX(b.x),
        mapY(b.y),
      );
    }
  }
  ctx.stroke();

  // points + tangent handles (handles only for a lone selection). A live rubber
  // band previews the points it covers, so the selection is predictable before
  // the pointer is released.
  const box = dragging.value?.kind === "box" ? normalizeBox(dragging.value) : null;
  const covered = box ? new Set(pointsInBox(box)) : null;
  const single = selected.value.size === 1;
  pts.forEach((pt) => {
    const px = mapX(pt.x);
    const py = mapY(pt.y);
    const isSel = selected.value.has(pt) || covered?.has(pt) === true;

    if (mode.value === "bezier" && isSel && single && editable.value) {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(mapX(pt.x + pt.rx), mapY(pt.y + pt.ry));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(mapX(pt.x + pt.lx), mapY(pt.y + pt.ly));
      ctx.stroke();
      ctx.fillStyle = HANDLE;
      ctx.fillRect(mapX(pt.x + pt.rx) - 3.5, mapY(pt.y + pt.ry) - 3.5, 7, 7);
      ctx.fillRect(mapX(pt.x + pt.lx) - 3.5, mapY(pt.y + pt.ly) - 3.5, 7, 7);
    }

    ctx.beginPath();
    ctx.arc(px, py, isSel ? POINT_R_SELECTED : POINT_R, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? HANDLE : POINT;
    ctx.fill();
    if (isSel) {
      ctx.strokeStyle = CURVE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  if (box) {
    ctx.fillStyle = "rgba(37, 99, 235, 0.10)";
    ctx.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    ctx.strokeStyle = "rgba(37, 99, 235, 0.8)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(box.minX + 0.5, box.minY + 0.5, box.maxX - box.minX, box.maxY - box.minY);
    ctx.setLineDash([]);
  }
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

type Hit = { kind: "point" | "left" | "right"; point: CurvePoint };

function hitTest(px: number, py: number): Hit | null {
  const R = 8;
  const single = selectedPoint.value;
  if (mode.value === "bezier" && single) {
    const hx = mapX(single.x + single.rx);
    const hy = mapY(single.y + single.ry);
    if (Math.abs(px - hx) < R && Math.abs(py - hy) < R) return { kind: "right", point: single };
    const lx = mapX(single.x + single.lx);
    const ly = mapY(single.y + single.ly);
    if (Math.abs(px - lx) < R && Math.abs(py - ly) < R) return { kind: "left", point: single };
  }
  for (let i = points.value.length - 1; i >= 0; i--) {
    const p = points.value[i];
    if (Math.abs(px - mapX(p.x)) < R && Math.abs(py - mapY(p.y)) < R) return { kind: "point", point: p };
  }
  return null;
}

function insertionIndex(x: number): number {
  for (let i = 0; i < points.value.length; i++) {
    if (points.value[i].x >= x) return i;
  }
  return points.value.length;
}

/** Stable re-sort by time. The point objects keep their identity, so the
 * selection follows them across the reorder (see `selected`). */
function sortPoints(): void {
  points.value.sort((a, b) => a.x - b.x);
}

/* ------------------------------ rubber band ------------------------------- */

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Normalizes a rubber-band drag (any direction) into a rectangle. */
function normalizeBox(d: Extract<Drag, { kind: "box" }>): Box {
  return {
    minX: Math.min(d.startX, d.x),
    maxX: Math.max(d.startX, d.x),
    minY: Math.min(d.startY, d.y),
    maxY: Math.max(d.startY, d.y),
  };
}

/** Every point whose dot centre falls inside `box` (canvas pixels). */
function pointsInBox(box: Box): CurvePoint[] {
  return points.value.filter((p) => {
    const px = mapX(p.x);
    const py = mapY(p.y);
    return px >= box.minX && px <= box.maxX && py >= box.minY && py <= box.maxY;
  });
}

/* ------------------------------- interaction ------------------------------ */

function canvasPos(e: PointerEvent | MouseEvent): { px: number; py: number } {
  const rect = (canvas.value as HTMLCanvasElement).getBoundingClientRect();
  return { px: e.clientX - rect.left, py: e.clientY - rect.top };
}

function isSelected(p: CurvePoint): boolean {
  return selected.value.has(p);
}

function selectOnly(p: CurvePoint | null): void {
  setSelection(p ? [p] : []);
}

function beginDrag(kind: "point" | "left" | "right", point: CurvePoint, px: number, py: number): void {
  dragging.value = { kind, point, startX: px, startY: py };
}

function beginBoxDrag(px: number, py: number): void {
  dragging.value = { kind: "box", startX: px, startY: py, x: px, y: py };
}

function beginGroupDrag(px: number, py: number, fromEmpty: boolean): void {
  dragging.value = {
    kind: "group",
    startX: px,
    startY: py,
    fromEmpty,
    moved: false,
    origin: selectedList.value.map((p) => ({ point: p, x: p.x, y: p.y })),
    center: scaleBase ? { x: scaleBase.cx, y: scaleBase.cy } : null,
  };
}

function addPointAt(px: number, py: number): void {
  if (!editable.value || points.value.length >= MAX_POINTS) return;
  const x = clamp(unmapX(px), timeMin.value, timeMax.value);
  const y = clamp(unmapY(py), valueMin.value, valueMax.value);
  const index = insertionIndex(x);
  points.value.splice(index, 0, { x, y, lx: -0.2, ly: 0, rx: 0.2, ry: 0 });
  selectOnly(points.value[index]);
  emitValue(true, true);
}

function onPointerDown(e: PointerEvent): void {
  if (!editable.value) return;
  const { px, py } = canvasPos(e);
  const hit = hitTest(px, py);
  const cv = canvas.value as HTMLCanvasElement;

  // Shift starts a rubber band anywhere on the canvas (over a point too: the
  // band is the only multi-select gesture).
  if (e.shiftKey) {
    beginBoxDrag(px, py);
    cv.setPointerCapture(e.pointerId);
    draw();
    return;
  }

  if (hit && hit.kind !== "point") {
    selectOnly(hit.point);
    beginDrag(hit.kind, hit.point, px, py);
    cv.setPointerCapture(e.pointerId);
    emitValue(true);
    draw();
    return;
  }

  if (hit) {
    // A point that is already part of a multi-selection drags the whole group.
    if (!isSelected(hit.point)) selectOnly(hit.point);
    if (selected.value.size > 1) beginGroupDrag(px, py, false);
    else beginDrag("point", hit.point, px, py);
    cv.setPointerCapture(e.pointerId);
    emitValue(true);
    return;
  }

  if (selected.value.size > 1) {
    // Empty space with a selection: drag the group, or (if the pointer never
    // moves) fall back to adding a point on release.
    beginGroupDrag(px, py, true);
    cv.setPointerCapture(e.pointerId);
    return;
  }

  addPointAt(px, py);
  cv.setPointerCapture(e.pointerId);
}

/** Moves every point of a group drag by the pointer delta, clamped so the
 * whole group stays in range, then re-sorts by x.
 *
 * The scale pivot is translated by the same (clamped) delta: the pivot belongs
 * to the selection, so it must not be left behind when the selection moves. */
function moveGroup(d: Extract<Drag, { kind: "group" }>, px: number, py: number): void {
  const dX = unmapX(px) - unmapX(d.startX);
  const dY = unmapY(py) - unmapY(d.startY);
  const xs = d.origin.map((o) => o.x);
  const ys = d.origin.map((o) => o.y);
  const shiftX = clamp(dX, timeMin.value - Math.min(...xs), timeMax.value - Math.max(...xs));
  const shiftY = clamp(dY, valueMin.value - Math.min(...ys), valueMax.value - Math.max(...ys));
  for (const o of d.origin) {
    o.point.x = o.x + shiftX;
    o.point.y = o.y + shiftY;
  }
  // The offsets are unchanged by a translation, only the base centre moves; it
  // is re-derived from its snapshotted value because `shiftX`/`shiftY` are
  // measured from the drag's start.
  if (scaleBase && d.center) {
    scaleBase.cx = d.center.x + shiftX;
    scaleBase.cy = d.center.y + shiftY;
  }
  sortPoints();
}

function onPointerMove(e: PointerEvent): void {
  const d = dragging.value;
  if (!d) return;
  const { px, py } = canvasPos(e);

  if (d.kind === "point") {
    const index = points.value.indexOf(d.point);
    const prev = points.value[index - 1];
    const next = points.value[index + 1];
    d.point.x = clamp(
      unmapX(px),
      prev ? prev.x + EPS : timeMin.value,
      next ? next.x - EPS : timeMax.value,
    );
    d.point.y = clamp(unmapY(py), valueMin.value, valueMax.value);
  } else if (d.kind === "group") {
    // A press that has not really moved yet is still a click, not a drag.
    if (!d.moved && Math.abs(px - d.startX) + Math.abs(py - d.startY) < 3) return;
    d.moved = true;
    moveGroup(d, px, py);
  } else if (d.kind === "box") {
    d.x = px;
    d.y = py;
    draw();
    return;
  } else if (d.kind === "right") {
    d.point.rx = unmapX(px) - d.point.x;
    d.point.ry = unmapY(py) - d.point.y;
  } else {
    d.point.lx = unmapX(px) - d.point.x;
    d.point.ly = unmapY(py) - d.point.y;
  }

  draw();
  emitValue(true);
}

function onPointerUp(): void {
  const d = dragging.value;
  if (!d) return;
  dragging.value = null;
  if (d.kind === "box") {
    const box = normalizeBox(d);
    const degenerate = box.maxX - box.minX < 3 && box.maxY - box.minY < 3;
    // A shift-click without a drag is not a selection gesture; keep what was
    // selected (right-click is the way to drop a selection).
    if (!degenerate) setSelection(pointsInBox(box));
    draw();
    return;
  }
  if (d.kind === "group" && d.fromEmpty && !d.moved) {
    // A plain click on empty space still adds a point.
    addPointAt(d.startX, d.startY);
    return;
  }
  emitValue(false, true);
}

function onDblClick(e: MouseEvent): void {
  if (!editable.value) return;
  const { px, py } = canvasPos(e);
  const hit = hitTest(px, py);
  if (hit?.kind === "point") removePoint(hit.point);
}

/**
 * Right-click: with a multi-selection it drops the whole selection (and its
 * scale base) — a quick way out of group editing; otherwise it removes the
 * point under the cursor.
 */
function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  if (!editable.value) return;
  if (selected.value.size > 1) {
    setSelection([]);
    draw();
    return;
  }
  const { px, py } = canvasPos(e);
  const hit = hitTest(px, py);
  if (hit?.kind === "point") removePoint(hit.point);
}

function removePoint(p: CurvePoint): void {
  if (points.value.length <= 1) return;
  const index = points.value.indexOf(p);
  if (index < 0) return;
  points.value.splice(index, 1);
  // The selection changed, so the scale base is re-captured from whatever is
  // still selected (the removed point is gone from `selectedList`).
  setSelection(selectedList.value);
  emitValue(false, true);
}

function removeSelected(): void {
  if (!canRemove.value) return;
  const doomed = new Set(selectedList.value);
  points.value = points.value.filter((p) => !doomed.has(p));
  setSelection([]);
  emitValue(false, true);
}

/* ------------------------------- scale sliders ---------------------------- */

/**
 * The factor to actually apply: the slider's value, capped so that no scaled
 * point leaves the axis bounds.
 *
 * Clamping the *factor* (instead of each point) keeps the selection's shape
 * intact and keeps the base offsets usable — clamping points individually would
 * squash them onto the bounds, and dragging the slider back would no longer
 * restore the original layout.
 */
function limitScale(base: NonNullable<typeof scaleBase>, axis: "x" | "y", factor: number): number {
  const centre = axis === "x" ? base.cx : base.cy;
  const lo = axis === "x" ? timeMin.value : valueMin.value;
  const hi = axis === "x" ? timeMax.value : valueMax.value;
  let max = SCALE_MAX;
  for (const b of base.points) {
    const d = axis === "x" ? b.dx : b.dy;
    if (Math.abs(d) < EPS) continue;
    // x = centre + d * s must stay inside [lo, hi]; dividing by a negative `d`
    // flips the bound, which is exactly the branch below.
    max = Math.min(max, d > 0 ? (hi - centre) / d : (lo - centre) / d);
  }
  return clamp(factor, SCALE_MIN, Math.max(SCALE_MIN, max));
}

/** Re-applies both sliders to the captured offsets (absolute, never compounded). */
function applyScale(): void {
  const base = scaleBase;
  if (!base) return;
  const sx = limitScale(base, "x", scaleX.value);
  const sy = limitScale(base, "y", scaleY.value);
  for (const b of base.points) {
    b.point.x = base.cx + b.dx * sx;
    b.point.y = base.cy + b.dy * sy;
  }
  // An x scale moves points past each other: keep the polyline sorted, and the
  // selection stays attached to the points themselves.
  sortPoints();
  draw();
}

function onScaleInput(axis: "x" | "y", e: Event): void {
  const value = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  if (!scaleBase) captureScaleBase();
  if (!scaleBase) return;
  if (axis === "x") scaleX.value = value;
  else scaleY.value = value;
  applyScale();
  emitValue(true);
}

/** Pointer release / keyboard commit: the sliders keep their value, they are
 * absolute until the selection changes. */
function commitScale(): void {
  if (!scaleBase) return;
  emitValue(false, true);
}

/* --------------------------------- toolbar -------------------------------- */

function reset(): void {
  if (!editable.value) return;
  const spanT = timeMax.value - timeMin.value;
  const spanV = valueMax.value - valueMin.value;
  points.value = [
    { x: timeMin.value, y: valueMin.value, lx: 0, ly: 0, rx: spanT / 2, ry: 0 },
    { x: timeMax.value, y: valueMax.value, lx: -spanT / 2, ly: 0, rx: 0, ry: 0 },
  ];
  setSelection([]);
  emitValue(true, true);
}

function onPointField(field: "x" | "y", value: string): void {
  const p = selectedPoint.value;
  if (!p) return;
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  if (field === "x") {
    const index = points.value.indexOf(p);
    const prev = points.value[index - 1];
    const next = points.value[index + 1];
    p.x = clamp(n, prev ? prev.x + EPS : timeMin.value, next ? next.x - EPS : timeMax.value);
  } else {
    p.y = clamp(n, valueMin.value, valueMax.value);
  }
  emitValue(true, true);
  draw();
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, "");
}
</script>

<template>
  <div class="ji-curve">
    <div class="ji-curve__body">
      <div class="ji-curve__axis" :style="{ paddingTop: `${AXIS_LABEL_PAD}px`, paddingBottom: `${AXIS_LABEL_PAD}px` }">
        <span class="ji-curve__axis-label">{{ fmt(valueMax) }}</span>
        <span class="ji-curve__axis-label">{{ fmt(midValue) }}</span>
        <span class="ji-curve__axis-label">{{ fmt(valueMin) }}</span>
      </div>
      <canvas ref="canvas" class="ji-curve__canvas" :class="{ 'is-editable': editable }" tabindex="0"
        @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
        @dblclick="onDblClick" @contextmenu="onContextMenu" @keydown.delete.prevent="removeSelected"></canvas>
      <div class="ji-curve__scale-y">
        <span class="ji-curve__scale-tag">Y</span>
        <input class="ji-curve__scale" type="range" :min="SCALE_MIN" :max="SCALE_MAX" step="0.01" :value="scaleY"
          :disabled="!scaleEnabled" title="Scale the selected points on the Y axis (1 = as selected)"
          @input="onScaleInput('y', $event)" @pointerup="commitScale" @pointercancel="commitScale"
          @change="commitScale" />
      </div>
    </div>
    <div class="ji-curve__scale-x">
      <span class="ji-curve__scale-tag">X</span>
      <input class="ji-curve__scale" type="range" :min="SCALE_MIN" :max="SCALE_MAX" step="0.01" :value="scaleX"
        :disabled="!scaleEnabled" title="Scale the selected points on the X axis (1 = as selected)"
        @input="onScaleInput('x', $event)" @pointerup="commitScale" @pointercancel="commitScale"
        @change="commitScale" />
    </div>
    <div class="ji-curve__toolbar">
      <select v-model="mode" class="ji-input ji-curve__mode" :disabled="!editable">
        <option value="bezier">Bezier</option>
        <option value="linear">Linear</option>
      </select>
      <button class="ji-btn" :disabled="!editable" title="Reset to linear ramp" @click="reset">reset</button>
      <label class="ji-curve__field">
        <span>X</span>
        <input class="ji-input ji-curve__point-field" type="number" :step="(timeMax - timeMin) / 100"
          :value="selectedPoint ? fmt(selectedPoint.x) : ''" :disabled="!selectedPoint || !editable"
          @change="onPointField('x', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="ji-curve__field">
        <span>Y</span>
        <input class="ji-input ji-curve__point-field" type="number" :step="(valueMax - valueMin) / 100"
          :value="selectedPoint ? fmt(selectedPoint.y) : ''" :disabled="!selectedPoint || !editable"
          @change="onPointField('y', ($event.target as HTMLInputElement).value)" />
      </label>
      <button class="ji-btn" :disabled="!canRemove" title="Remove the selected point(s)" @click="removeSelected">
        −
      </button>
    </div>
  </div>
</template>

<style scoped>
.ji-curve {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ji-curve__body {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.ji-curve__axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  min-width: 30px;
  font-size: 10px;
  line-height: 1;
  color: var(--ji-text-dim);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.ji-curve__canvas {
  flex: 1 1 auto;
  min-width: 0;
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

.ji-curve__scale-y {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 20px;
  flex: 0 0 auto;
  color: var(--ji-text-dim);
}

.ji-curve__scale-y .ji-curve__scale {
  flex: 1 1 auto;
  width: 14px;
  min-height: 0;
  writing-mode: vertical-lr;
  direction: rtl;
}

.ji-curve__scale-x {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ji-text-dim);
}

.ji-curve__scale-x .ji-curve__scale {
  flex: 1 1 auto;
  min-width: 0;
}

.ji-curve__scale-tag {
  font-size: 10px;
  line-height: 1;
  user-select: none;
}

.ji-curve__scale:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ji-curve__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.ji-curve__mode {
  width: 72px;
}

.ji-curve__field {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--ji-text-dim);
}

.ji-curve__point-field {
  width: 58px;
  padding: 1px 4px;
  font-variant-numeric: tabular-nums;
}
</style>
