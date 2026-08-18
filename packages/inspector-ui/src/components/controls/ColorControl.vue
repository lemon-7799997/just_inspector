<script setup lang="ts">
import { ref, watch } from "vue";
import { ColorPicker } from "vue-color-kit";
import "vue-color-kit/dist/vue-color-kit.css";
import { color, type ColorValue, type TaggedValue } from "@just-inspector/protocol";

const props = defineProps<{
  modelValue: ColorValue;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

interface KitColor {
  hex: string;
  rgba: { r: number; g: number; b: number; a: number };
}

function toHex(c: ColorValue): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function fromKit(kit: KitColor): ColorValue {
  const { r, g, b, a } = kit.rgba;
  return color(
    Math.min(1, Math.max(0, r / 255)),
    Math.min(1, Math.max(0, g / 255)),
    Math.min(1, Math.max(0, b / 255)),
    Math.min(1, Math.max(0, a)),
  );
}

const hex = ref(toHex(props.modelValue));

watch(
  () => props.modelValue,
  (v) => {
    hex.value = toHex(v);
  },
  { deep: true },
);

/**
 * vue-color-kit 1.0.6 only emits `changeColor` (continuously while dragging);
 * there is no "closed" event, so commit is handled by the app's debounced
 * send. The hex string is kept in sync with the authoritative model value.
 */
function onChangeColor(kit: KitColor): void {
  hex.value = kit.hex;
  emit("update", fromKit(kit), true);
}
</script>

<template>
  <div class="ji-color">
    <ColorPicker theme="dark" :color="hex" :sucker-hide="true" @change-color="onChangeColor" />
  </div>
</template>

<style scoped>
.ji-color :deep(.vc-color-wrap) {
  width: 28px;
  height: 22px;
  border-radius: var(--ji-radius);
  border: 1px solid var(--ji-border-strong);
  box-shadow: none;
}

.ji-color :deep(.vc-popover) {
  z-index: 50;
}
</style>
