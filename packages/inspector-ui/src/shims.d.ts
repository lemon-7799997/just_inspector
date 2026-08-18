/// <reference types="vite/client" />

declare module "*.css";

/**
 * Lets plain `tsc` / IDEs without the Volar ("Vue - Official") extension
 * resolve `.vue` imports in this package's `.ts` files. The build itself uses
 * `vue-tsc`, which prefers the real SFC types over this fallback, so precise
 * component typings are unaffected.
 */
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module "vue-color-kit" {
  import type { DefineComponent } from "vue";
  export const ColorPicker: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  const ColorKit: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default ColorKit;
}
