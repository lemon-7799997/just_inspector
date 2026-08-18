import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Standalone browser build.
 *
 * The whole app — connection layer included — is inlined into ONE
 * self-contained `dist/index.html` (JS + CSS). Open it directly (file://) or
 * serve it with any static server; no Node.js is involved at runtime.
 */
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  // Relative paths keep the built file portable (also used by the dev build).
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    cssCodeSplit: false,
  },
});
