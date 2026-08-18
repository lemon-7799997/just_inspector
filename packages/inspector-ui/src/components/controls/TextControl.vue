<script setup lang="ts">
import { ref, watch } from "vue";
import { str, type PropertyHint, type StringValue, type TaggedValue } from "@just-inspector/protocol";

const props = defineProps<{
  modelValue: StringValue;
  hint?: PropertyHint;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const text = ref(props.modelValue.value);

watch(
  () => props.modelValue.value,
  (v) => {
    text.value = v;
  },
);

function onInput(e: Event): void {
  text.value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  emit("update", str(text.value), false);
}

function commit(): void {
  emit("commit", str(text.value));
}
</script>

<template>
  <textarea
    v-if="hint?.multiline"
    class="ji-input"
    rows="3"
    :value="text"
    :readonly="readOnly"
    :placeholder="hint?.placeholder"
    @input="onInput"
    @change="commit"
    @keydown.enter.prevent="commit"
    @blur="commit"
  ></textarea>
  <input
    v-else
    class="ji-input"
    type="text"
    :value="text"
    :readonly="readOnly"
    :placeholder="hint?.placeholder"
    @input="onInput"
    @change="commit"
    @keydown.enter.prevent="commit"
    @blur="commit"
  />
</template>
