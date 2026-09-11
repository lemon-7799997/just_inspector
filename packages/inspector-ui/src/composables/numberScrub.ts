import { ref } from "vue";

/** Pixels of travel after which the drag sensitivity has doubled. */
const ACCEL_DISTANCE = 80;

export interface NumberScrubOptions {
  /** Base value change per pixel of raw drag (before acceleration). */
  step: () => number;
  /** Current value, sampled when the drag starts. */
  value: () => number;
  /** Rounds / clamps a candidate value (e.g. integers, slider grid). */
  quantize?: (value: number) => number;
  /** Live update while dragging (debounced by the store). */
  update: (value: number, live: boolean) => void;
  /** Final value on pointer up. */
  commit: (value: number) => void;
}

/**
 * Press-and-slide editing for numeric labels — the `< >` (ew-resize) affordance.
 *
 * The further the pointer slides, the coarser each pixel becomes: the first
 * pixels move the value by one `step`, and the multiplier grows linearly with
 * the distance already travelled (+1x every {@link ACCEL_DISTANCE} px). A short
 * nudge stays precise while a long drag covers a large range quickly.
 *
 * The `ji-scrubbing` class is set on `<body>` for the duration of the drag so
 * the resize cursor follows the pointer even when it leaves the label.
 */
export function useNumberScrub(options: NumberScrubOptions) {
  const dragging = ref(false);
  let lastX = 0;
  let travelled = 0;
  let current = 0;

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging.value = true;
    lastX = event.clientX;
    travelled = 0;
    current = options.value();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    document.body.classList.add("ji-scrubbing");
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging.value) return;
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    if (dx === 0) return;
    travelled += Math.abs(dx);
    const accel = 1 + travelled / ACCEL_DISTANCE;
    current += dx * options.step() * accel;
    const next = options.quantize ? options.quantize(current) : current;
    current = next;
    options.update(next, true);
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging.value) return;
    dragging.value = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    document.body.classList.remove("ji-scrubbing");
    options.commit(current);
  }

  return { dragging, onPointerDown, onPointerMove, onPointerUp };
}
