<script setup lang="ts">
import { computed } from "vue";
import {
  describeValue,
  float,
  int,
  valuesEqual,
  type ControlKind,
  type PropertyDescriptor,
  type TaggedValue,
} from "@just-inspector/protocol";
import { humanizeFieldName } from "../../composables/format";
import { useNumberScrub } from "../../composables/numberScrub";
import TextControl from "../controls/TextControl.vue";
import NumberControl from "../controls/NumberControl.vue";
import SliderControl from "../controls/SliderControl.vue";
import SelectControl from "../controls/SelectControl.vue";
import BoolControl from "../controls/BoolControl.vue";
import ColorControl from "../controls/ColorControl.vue";
import CurveControl from "../controls/CurveControl.vue";
import VectorControl from "../controls/VectorControl.vue";
import JsonControl from "../controls/JsonControl.vue";

const props = defineProps<{
  property: PropertyDescriptor;
  /** Global setting: spaced UpperCamelCase labels for machine names. */
  prettyNames: boolean;
}>();

const emit = defineEmits<{
  update: [property: string, value: TaggedValue, live: boolean];
  commit: [property: string, value: TaggedValue];
}>();

const control = computed<ControlKind>(() => resolveControl(props.property));
const isReadOnly = computed(() => props.property.readOnly === true);

/** An explicit game-provided name always wins over the global transform. */
const label = computed(() => {
  if (props.property.displayName) return props.property.displayName;
  return props.prettyNames ? humanizeFieldName(props.property.name) : props.property.name;
});

/* ------------------------------- reset ---------------------------------- */

const canReset = computed(() => props.property.defaultValue !== undefined && !isReadOnly.value);
const isAtDefault = computed(() => valuesEqual(props.property.value, props.property.defaultValue));
const resetTitle = computed(() =>
  props.property.defaultValue ? `Reset to default (${describeValue(props.property.defaultValue)})` : "Reset to default",
);

function onReset(): void {
  const value = props.property.defaultValue;
  if (!value || isReadOnly.value) return;
  emit("commit", props.property.name, value);
}

/* --------------------------- label drag scrub ---------------------------- */

const canScrub = computed(
  () =>
    control.value === "number" &&
    !isReadOnly.value &&
    (props.property.value.type === "int" || props.property.value.type === "float"),
);

function currentNumber(): number {
  const v = props.property.value;
  return v.type === "int" || v.type === "float" ? v.value : 0;
}

function scrubStep(): number {
  const step = props.property.hint?.step;
  if (step !== undefined && step > 0) return step;
  return props.property.value.type === "int" ? 1 : 0.1;
}

function quantizeNumber(n: number): number {
  const { min, max } = props.property.hint ?? {};
  let v = n;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  if (props.property.value.type === "int") v = Math.round(v);
  // Strip float noise from the accelerating drag (0.30000000000000004).
  return Number(v.toFixed(6));
}

function toTagged(n: number): TaggedValue {
  return props.property.value.type === "int" ? int(Math.round(n)) : float(n);
}

const {
  dragging: scrubDragging,
  onPointerDown: onScrubPointerDown,
  onPointerMove: onScrubPointerMove,
  onPointerUp: onScrubPointerUp,
} = useNumberScrub({
  step: scrubStep,
  value: currentNumber,
  quantize: quantizeNumber,
  update: (value, live) => emit("update", props.property.name, toTagged(value), live),
  commit: (value) => emit("commit", props.property.name, toTagged(value)),
});

function onLabelPointerDown(event: PointerEvent): void {
  if (canScrub.value) onScrubPointerDown(event);
}

function onLabelPointerMove(event: PointerEvent): void {
  if (canScrub.value) onScrubPointerMove(event);
}

function onLabelPointerUp(event: PointerEvent): void {
  if (canScrub.value) onScrubPointerUp(event);
}

/* ------------------------------- control -------------------------------- */

function resolveControl(p: PropertyDescriptor): ControlKind {
  if (p.control && p.control !== "auto") return p.control;
  switch (p.value.type) {
    case "string":
      return "text";
    case "int":
    case "float":
      return p.hint?.min !== undefined && p.hint?.max !== undefined ? "slider" : "number";
    case "bool":
      return "checkbox";
    case "color":
      return "color";
    case "enum":
      return "dropdown";
    case "curve":
      return "curve";
    case "vec2":
    case "vec3":
    case "vec4":
      return "vector";
    case "array":
      return "array";
    case "object":
      return "object";
    case "asset":
      return "asset";
    default:
      return "auto";
  }
}

function onUpdate(value: TaggedValue, live = false): void {
  emit("update", props.property.name, value, live);
}

function onCommit(value: TaggedValue): void {
  emit("commit", props.property.name, value);
}
</script>

<template>
  <div class="ji-row" :title="property.tooltip">
    <div
      class="ji-row__label"
      :class="{
        'is-readonly': isReadOnly,
        'is-scrubbable': canScrub,
        'is-scrubbing': scrubDragging,
      }"
      @pointerdown="onLabelPointerDown"
      @pointermove="onLabelPointerMove"
      @pointerup="onLabelPointerUp"
      @pointercancel="onLabelPointerUp"
    >
      {{ label }}
    </div>
    <div class="ji-row__control">
      <div class="ji-row__input">
        <template v-if="isReadOnly">
          <span class="ji-row__readonly">{{ describeValue(property.value) }}</span>
        </template>
        <TextControl
          v-else-if="control === 'text'"
          :model-value="property.value as any"
          :hint="property.hint"
          @update="onUpdate"
          @commit="onCommit"
        />
        <NumberControl
          v-else-if="control === 'number'"
          :model-value="property.value as any"
          :hint="property.hint"
          @update="onUpdate"
          @commit="onCommit"
        />
        <SliderControl
          v-else-if="control === 'slider'"
          :model-value="property.value as any"
          :hint="property.hint"
          @update="onUpdate"
          @commit="onCommit"
        />
        <SelectControl
          v-else-if="control === 'dropdown'"
          :model-value="property.value as any"
          :hint="property.hint"
          @update="onUpdate"
          @commit="onCommit"
        />
        <BoolControl v-else-if="control === 'checkbox'" :model-value="property.value as any" @commit="onCommit" />
        <ColorControl v-else-if="control === 'color'" :model-value="property.value as any" @update="onUpdate" @commit="onCommit" />
        <CurveControl
          v-else-if="control === 'curve'"
          :model-value="property.value as any"
          :hint="property.hint"
          @update="onUpdate"
          @commit="onCommit"
        />
        <VectorControl v-else-if="control === 'vector'" :model-value="property.value as any" @update="onUpdate" @commit="onCommit" />
        <JsonControl v-else :model-value="property.value" @commit="onCommit" />
      </div>
      <button
        v-if="canReset"
        class="ji-row__reset"
        :class="{ 'is-changed': !isAtDefault }"
        type="button"
        :disabled="isAtDefault"
        :title="resetTitle"
        @click="onReset"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M13 8a5 5 0 1 1-1.46-3.54" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <path
            d="M13 2.5V5.5H10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ji-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.ji-row:hover {
  background: var(--ji-bg-hover);
}

.ji-row__label {
  flex: 0 0 38%;
  min-width: 120px;
  padding-top: 4px;
  font-size: 12px;
  color: var(--ji-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

.ji-row__label.is-readonly {
  color: var(--ji-text-dim);
}

/* Drag-to-adjust affordance: `< >` cursor, and a highlight while dragging. */
.ji-row__label.is-scrubbable {
  cursor: ew-resize;
  touch-action: none;
}

.ji-row__label.is-scrubbing {
  color: var(--ji-accent);
  background: var(--ji-accent-dim);
  border-radius: var(--ji-radius);
}

.ji-row__control {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ji-row__input {
  flex: 1;
  min-width: 0;
  display: flex;
}

.ji-row__input > * {
  width: 100%;
}

.ji-row__readonly {
  font-size: 12px;
  color: var(--ji-text-dim);
  word-break: break-all;
}

.ji-row__reset {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--ji-text-dim);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ji-radius);
  cursor: pointer;
}

.ji-row__reset:hover:not(:disabled) {
  color: var(--ji-accent);
  border-color: var(--ji-border);
  background: var(--ji-bg-input);
}

/* Highlight only when the field actually differs from the startup value. */
.ji-row__reset.is-changed {
  color: var(--ji-accent);
}

.ji-row__reset:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
