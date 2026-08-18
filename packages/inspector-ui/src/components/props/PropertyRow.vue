<script setup lang="ts">
import { computed } from "vue";
import { describeValue, type ControlKind, type PropertyDescriptor, type TaggedValue } from "@just-inspector/protocol";
import TextControl from "../controls/TextControl.vue";
import NumberControl from "../controls/NumberControl.vue";
import SliderControl from "../controls/SliderControl.vue";
import SelectControl from "../controls/SelectControl.vue";
import BoolControl from "../controls/BoolControl.vue";
import ColorControl from "../controls/ColorControl.vue";
import CurveControl from "../controls/CurveControl.vue";
import VectorControl from "../controls/VectorControl.vue";
import JsonControl from "../controls/JsonControl.vue";

const props = defineProps<{ property: PropertyDescriptor }>();

const emit = defineEmits<{
  update: [property: string, value: TaggedValue, live: boolean];
  commit: [property: string, value: TaggedValue];
}>();

const control = computed<ControlKind>(() => resolveControl(props.property));
const isReadOnly = computed(() => props.property.readOnly === true);

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
    <div class="ji-row__label" :class="{ 'is-readonly': isReadOnly }">
      {{ property.displayName ?? property.name }}
    </div>
    <div class="ji-row__control">
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
  </div>
</template>

<style scoped>
.ji-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
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

.ji-row__control {
  flex: 1;
  min-width: 0;
  display: flex;
}

.ji-row__control > * {
  width: 100%;
}

.ji-row__readonly {
  font-size: 12px;
  color: var(--ji-text-dim);
  padding-top: 3px;
  word-break: break-all;
}
</style>
