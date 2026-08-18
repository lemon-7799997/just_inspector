<script setup lang="ts">
import { computed } from "vue";
import { enumValue, type EnumOption, type EnumValue, type PropertyHint, type TaggedValue } from "@just-inspector/protocol";

const props = defineProps<{
  modelValue: EnumValue;
  hint?: PropertyHint;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const options = computed<EnumOption[]>(() => {
  if (props.modelValue.options.length > 0) return props.modelValue.options;
  return props.hint?.options ?? [];
});

function onChange(e: Event): void {
  const raw = (e.target as HTMLSelectElement).value;
  const matched = options.value.find((o) => String(o.value) === raw);
  const value = matched ? matched.value : raw;
  emit("commit", enumValue(value, props.modelValue.options));
}

function labelOf(o: EnumOption): string {
  return o.label ?? String(o.value);
}

function isCurrent(o: EnumOption): boolean {
  return String(o.value) === String(props.modelValue.value);
}
</script>

<template>
  <select class="ji-input" :disabled="readOnly" @change="onChange">
    <option v-for="o in options" :key="String(o.value)" :value="String(o.value)" :selected="isCurrent(o)">
      {{ labelOf(o) }}
    </option>
  </select>
</template>
