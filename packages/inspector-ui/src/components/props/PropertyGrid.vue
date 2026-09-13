<script setup lang="ts">
import { computed, ref } from "vue";
import type { NodeDetail, PropertyDescriptor, TaggedValue } from "@just-inspector/protocol";
import PropertyRow from "./PropertyRow.vue";

const props = defineProps<{
  detail: NodeDetail | null;
  /** Render machine names as spaced UpperCamelCase (see `humanizeFieldName`). */
  prettyNames: boolean;
}>();

const emit = defineEmits<{
  update: [property: string, value: TaggedValue, live: boolean];
  commit: [property: string, value: TaggedValue];
}>();

interface FieldGroup {
  key: string;
  /** Section title; `null` for the leading run of ungrouped fields. */
  title: string | null;
  properties: PropertyDescriptor[];
}

/**
 * Consecutive properties carrying the same `group` become one section; runs
 * without a group render as a plain (headerless) block. Order is preserved
 * from the protocol, so the game controls the layout.
 */
const groups = computed<FieldGroup[]>(() => {
  const result: FieldGroup[] = [];
  for (const property of props.detail?.properties ?? []) {
    const title = property.group ?? null;
    const last = result[result.length - 1];
    if (last && last.title === title) {
      last.properties.push(property);
    } else {
      result.push({ key: title ?? `@ungrouped-${result.length}`, title, properties: [property] });
    }
  }
  return result;
});

/** Fold state per group key; absent = expanded (the default). */
const collapsed = ref<Record<string, boolean>>({});

function toggleGroup(key: string): void {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] };
}

function isCollapsed(key: string): boolean {
  return collapsed.value[key] === true;
}

/* ------------------------------- toolbar -------------------------------- */

const groupedSections = computed(() => groups.value.filter((group) => group.title !== null));
const allFolded = computed(
  () => groupedSections.value.length > 0 && groupedSections.value.every((group) => isCollapsed(group.key)),
);
const anyFolded = computed(() => groupedSections.value.some((group) => isCollapsed(group.key)));

/** Enabled when at least one field carries a startup value to restore. */
const canResetAll = computed(() =>
  (props.detail?.properties ?? []).some(
    (property) => property.defaultValue !== undefined && property.readOnly !== true,
  ),
);

/** Writes every field's `defaultValue` back (each goes through setValue). */
function resetAll(): void {
  for (const property of props.detail?.properties ?? []) {
    if (property.defaultValue !== undefined && property.readOnly !== true) {
      emit("commit", property.name, property.defaultValue);
    }
  }
}

function foldAll(): void {
  const next = { ...collapsed.value };
  for (const group of groupedSections.value) next[group.key] = true;
  collapsed.value = next;
}

function unfoldAll(): void {
  const next = { ...collapsed.value };
  for (const group of groupedSections.value) next[group.key] = false;
  collapsed.value = next;
}

function onRowUpdate(property: string, value: TaggedValue, live: boolean): void {
  emit("update", property, value, live);
}

function onRowCommit(property: string, value: TaggedValue): void {
  emit("commit", property, value);
}
</script>

<template>
  <div class="ji-grid">
    <template v-if="detail">
      <div class="ji-grid__header">
        <div class="ji-grid__title">
          <span class="ji-grid__name">{{ detail.name }}</span>
          <span v-if="detail.kind" class="ji-grid__kind">{{ detail.kind }}</span>
        </div>
        <div v-if="detail.path" class="ji-grid__path">{{ detail.path }}</div>
      </div>
      <div class="ji-grid__toolbar">
        <button
          class="ji-btn"
          type="button"
          :disabled="!canResetAll"
          title="Reset every field to the game's startup value"
          @click="resetAll"
        >
          Reset All
        </button>
        <button
          class="ji-btn"
          type="button"
          :disabled="groupedSections.length === 0 || allFolded"
          title="Collapse every group"
          @click="foldAll"
        >
          Fold All
        </button>
        <button
          class="ji-btn"
          type="button"
          :disabled="groupedSections.length === 0 || !anyFolded"
          title="Expand every group"
          @click="unfoldAll"
        >
          Unfold All
        </button>
      </div>
      <div class="ji-grid__props">
        <section v-for="group in groups" :key="group.key" class="ji-grid__group">
          <button
            v-if="group.title"
            class="ji-group__header"
            type="button"
            :aria-expanded="!isCollapsed(group.key)"
            @click="toggleGroup(group.key)"
          >
            <span class="ji-group__chevron" :class="{ 'is-open': !isCollapsed(group.key) }">▶</span>
            <span class="ji-group__title">{{ group.title }}</span>
          </button>
          <div v-show="!group.title || !isCollapsed(group.key)">
            <PropertyRow
              v-for="p in group.properties"
              :key="p.name"
              :property="p"
              :pretty-names="prettyNames"
              @update="onRowUpdate"
              @commit="onRowCommit"
            />
          </div>
        </section>
        <div v-if="detail.properties.length === 0" class="ji-grid__empty">This node has no inspectable properties.</div>
      </div>
    </template>
    <div v-else class="ji-grid__empty">Select a node in the scene tree to inspect its properties.</div>
  </div>
</template>

<style scoped>
.ji-grid {
  flex: 1;
  min-width: 0;
  /* Flex items default to `min-height: auto`; without this the property list
     cannot shrink below its content in the vertical (portrait) layout, so it
     grows past the window instead of showing a scrollbar. */
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ji-bg);
}

.ji-grid__header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--ji-border);
  background: var(--ji-bg-alt);
  flex: none;
}

/* Field-list actions, right-aligned above the rows. */
.ji-grid__toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--ji-border);
  background: var(--ji-bg-alt);
  flex: none;
}

.ji-grid__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ji-grid__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ji-text-strong);
}

.ji-grid__kind {
  font-size: 11px;
  color: var(--ji-accent);
}

.ji-grid__path {
  margin-top: 2px;
  font-size: 11px;
  font-family: var(--ji-mono);
  color: var(--ji-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ji-grid__props {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}

/* --- collapsible field groups ------------------------------------------ */

.ji-group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 10px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-align: left;
  color: var(--ji-text-strong);
  background: var(--ji-bg-alt);
  border: none;
  border-top: 1px solid var(--ji-border);
  border-bottom: 1px solid var(--ji-border);
  cursor: pointer;
}

.ji-group__header:hover {
  background: var(--ji-bg-hover);
}

.ji-group__chevron {
  display: inline-block;
  font-size: 8px;
  color: var(--ji-text-dim);
  transition: transform 0.12s ease;
}

.ji-group__chevron.is-open {
  transform: rotate(90deg);
}

.ji-grid__empty {
  padding: 24px 16px;
  color: var(--ji-text-dim);
  font-size: 12px;
  text-align: center;
}
</style>
