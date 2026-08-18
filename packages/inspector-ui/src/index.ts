import "./styles/main.css";

export { default as InspectorApp } from "./components/InspectorApp.vue";

export { default as NodeTree } from "./components/tree/NodeTree.vue";
export { default as PropertyGrid } from "./components/props/PropertyGrid.vue";
export { default as PropertyRow } from "./components/props/PropertyRow.vue";

export { default as TextControl } from "./components/controls/TextControl.vue";
export { default as NumberControl } from "./components/controls/NumberControl.vue";
export { default as SliderControl } from "./components/controls/SliderControl.vue";
export { default as SelectControl } from "./components/controls/SelectControl.vue";
export { default as BoolControl } from "./components/controls/BoolControl.vue";
export { default as ColorControl } from "./components/controls/ColorControl.vue";
export { default as CurveControl } from "./components/controls/CurveControl.vue";
export { default as VectorControl } from "./components/controls/VectorControl.vue";
export { default as JsonControl } from "./components/controls/JsonControl.vue";

export { useInspector } from "./composables/useInspector";
export type { ToastItem, LogEntry, InspectorStore } from "./composables/useInspector";
export type { TreeDockPosition, Persistence } from "./composables/persistence";
