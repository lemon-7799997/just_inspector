<script setup lang="ts">
import { computed, ref } from "vue";
import { vec2, vec3, vec4, type TaggedValue, type Vec2Value, type Vec3Value, type Vec4Value } from "@just-inspector/protocol";
import { useNumberScrub } from "../../composables/numberScrub";

type VecValue = Vec2Value | Vec3Value | Vec4Value;
type ComponentKey = "x" | "y" | "z" | "w";

const props = defineProps<{
  modelValue: VecValue;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const components = computed<Array<{ key: ComponentKey; label: string }>>(() => {
  switch (props.modelValue.type) {
    case "vec2":
      return [
        { key: "x", label: "X" },
        { key: "y", label: "Y" },
      ];
    case "vec3":
      return [
        { key: "x", label: "X" },
        { key: "y", label: "Y" },
        { key: "z", label: "Z" },
      ];
    case "vec4":
      return [
        { key: "x", label: "X" },
        { key: "y", label: "Y" },
        { key: "z", label: "Z" },
        { key: "w", label: "W" },
      ];
  }
});

function current(): VecValue {
  return props.modelValue;
}

function getComp(v: VecValue, key: ComponentKey): number {
  switch (v.type) {
    case "vec2":
      return key === "x" ? v.x : v.y;
    case "vec3":
      return key === "x" ? v.x : key === "y" ? v.y : v.z;
    case "vec4":
      return key === "x" ? v.x : key === "y" ? v.y : key === "z" ? v.z : v.w;
  }
}

function makeValue(key: ComponentKey, n: number): VecValue {
  const v = current();
  switch (v.type) {
    case "vec2":
      return key === "x" ? vec2(n, v.y) : vec2(v.x, n);
    case "vec3":
      return key === "x" ? vec3(n, v.y, v.z) : key === "y" ? vec3(v.x, n, v.z) : vec3(v.x, v.y, n);
    case "vec4":
      return key === "x"
        ? vec4(n, v.y, v.z, v.w)
        : key === "y"
          ? vec4(v.x, n, v.z, v.w)
          : key === "z"
            ? vec4(v.x, v.y, n, v.w)
            : vec4(v.x, v.y, v.z, n);
  }
}

function onInput(key: ComponentKey, e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("update", makeValue(key, n), false);
}

function onCommit(key: ComponentKey, e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("commit", makeValue(key, n));
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, "");
}

/* --------------------------- label drag scrub ---------------------------- */
/* One scrub instance drives whichever component label the pointer went down
   on; `activeKey` selects the component for the value getters/setters. */

const activeKey = ref<ComponentKey | null>(null);

const {
  dragging,
  onPointerDown: onScrubPointerDown,
  onPointerMove: onScrubPointerMove,
  onPointerUp: onScrubPointerUp,
} = useNumberScrub({
  step: () => 0.1,
  value: () => (activeKey.value ? getComp(props.modelValue, activeKey.value) : 0),
  quantize: (n) => Number(n.toFixed(6)),
  update: (value, live) => {
    if (activeKey.value) emit("update", makeValue(activeKey.value, value), live);
  },
  commit: (value) => {
    if (activeKey.value) emit("commit", makeValue(activeKey.value, value));
  },
});

function onLabelPointerDown(key: ComponentKey, event: PointerEvent): void {
  if (props.readOnly) return;
  activeKey.value = key;
  onScrubPointerDown(event);
}

function onLabelPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  onScrubPointerMove(event);
}

function onLabelPointerUp(event: PointerEvent): void {
  if (!dragging.value) return;
  onScrubPointerUp(event);
  activeKey.value = null;
}
</script>

<template>
  <div class="ji-vec">
    <label v-for="c in components" :key="c.key" class="ji-vec__field">
      <span
        class="ji-vec__label"
        :class="{ 'is-scrubbable': !readOnly, 'is-scrubbing': dragging && activeKey === c.key }"
        @pointerdown="onLabelPointerDown(c.key, $event)"
        @pointermove="onLabelPointerMove"
        @pointerup="onLabelPointerUp"
        @pointercancel="onLabelPointerUp"
      >{{ c.label }}</span>
      <input
        class="ji-input"
        type="number"
        step="any"
        :value="fmt(getComp(modelValue, c.key))"
        :readonly="readOnly"
        @input="onInput(c.key, $event)"
        @change="onCommit(c.key, $event)"
        @keydown.enter.prevent="onCommit(c.key, $event)"
        @blur="onCommit(c.key, $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.ji-vec {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
  /* No wrapping: the components share the row width equally. */
  flex-wrap: nowrap;
}

.ji-vec__field {
  display: flex;
  align-items: center;
  gap: 4px;
  /* Every component takes an equal share of the row, so a vec2/vec3/vec4
     fills the control column instead of sitting at a fixed width. */
  flex: 1 1 0;
  min-width: 0;
}

.ji-vec__label {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: var(--ji-text-dim);
  width: 12px;
  text-align: center;
}

.ji-vec__label.is-scrubbable {
  cursor: ew-resize;
  touch-action: none;
}

.ji-vec__label.is-scrubbing {
  color: var(--ji-accent);
  border-radius: var(--ji-radius);
  background: var(--ji-accent-dim);
}

.ji-vec__field .ji-input {
  flex: 1;
  min-width: 0;
  width: auto;
  padding: 2px 4px;
  font-variant-numeric: tabular-nums;
}
</style>
