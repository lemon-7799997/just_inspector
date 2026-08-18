<script setup lang="ts">
import { computed } from "vue";
import { vec2, vec3, vec4, type TaggedValue, type Vec2Value, type Vec3Value, type Vec4Value } from "@just-inspector/protocol";

type VecValue = Vec2Value | Vec3Value | Vec4Value;

const props = defineProps<{
  modelValue: VecValue;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const components = computed<Array<{ key: "x" | "y" | "z" | "w"; label: string }>>(() => {
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

function getComp(v: VecValue, key: "x" | "y" | "z" | "w"): number {
  switch (v.type) {
    case "vec2":
      return key === "x" ? v.x : v.y;
    case "vec3":
      return key === "x" ? v.x : key === "y" ? v.y : v.z;
    case "vec4":
      return key === "x" ? v.x : key === "y" ? v.y : key === "z" ? v.z : v.w;
  }
}

function makeValue(key: "x" | "y" | "z" | "w", n: number): VecValue {
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

function onInput(key: "x" | "y" | "z" | "w", e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("update", makeValue(key, n), false);
}

function onCommit(key: "x" | "y" | "z" | "w", e: Event): void {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit("commit", makeValue(key, n));
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, "");
}
</script>

<template>
  <div class="ji-vec">
    <label v-for="c in components" :key="c.key" class="ji-vec__field">
      <span class="ji-vec__label">{{ c.label }}</span>
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
  flex-wrap: wrap;
}

.ji-vec__field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ji-vec__label {
  font-size: 10px;
  font-weight: 600;
  color: var(--ji-text-dim);
  width: 12px;
  text-align: center;
}

.ji-vec__field .ji-input {
  width: 64px;
  padding: 2px 4px;
  font-variant-numeric: tabular-nums;
}
</style>
