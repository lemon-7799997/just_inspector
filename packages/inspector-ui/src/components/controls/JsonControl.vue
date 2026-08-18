<script setup lang="ts">
import { ref, watch } from "vue";
import { isTaggedValue, type ArrayValue, type ObjectValue, type TaggedValue } from "@just-inspector/protocol";

const props = defineProps<{
  /** array | object | any unknown tagged value */
  modelValue: TaggedValue;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  update: [value: TaggedValue, live?: boolean];
  commit: [value: TaggedValue];
}>();

const text = ref(JSON.stringify(props.modelValue, null, 2));
const error = ref("");

watch(
  () => props.modelValue,
  (v) => {
    text.value = JSON.stringify(v, null, 2);
    error.value = "";
  },
  { deep: true },
);

function apply(): void {
  try {
    const parsed: unknown = JSON.parse(text.value);
    if (!isTaggedValue(parsed)) {
      error.value = "Value must be a tagged value: { \"type\": ..., ... }";
      return;
    }
    error.value = "";
    emit("commit", parsed);
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function isObjectLike(v: TaggedValue): v is ArrayValue | ObjectValue {
  return v.type === "array" || v.type === "object";
}
</script>

<template>
  <div class="ji-json">
    <textarea
      class="ji-input"
      rows="3"
      :value="text"
      :readonly="readOnly"
      spellcheck="false"
      @input="text = ($event.target as HTMLTextAreaElement).value"
    ></textarea>
    <div class="ji-json__bar">
      <span v-if="error" class="ji-json__error">{{ error }}</span>
      <span v-else-if="!isObjectLike(modelValue)" class="ji-json__hint">tagged JSON</span>
      <span v-else class="ji-json__hint">{{ modelValue.type }} · tagged JSON</span>
      <button v-if="!readOnly" class="ji-btn" @click="apply">Apply</button>
    </div>
  </div>
</template>

<style scoped>
.ji-json {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ji-json__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
}

.ji-json__hint {
  font-size: 10px;
  color: var(--ji-text-dim);
}

.ji-json__error {
  font-size: 11px;
  color: var(--ji-danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
