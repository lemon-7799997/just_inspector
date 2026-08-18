/// <reference types="vite/client" />

declare module "*.css";

declare module "vue-color-kit" {
  import type { DefineComponent } from "vue";
  export const ColorPicker: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  const ColorKit: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default ColorKit;
}
