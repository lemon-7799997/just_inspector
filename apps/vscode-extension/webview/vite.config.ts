import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Webview UI build. The whole app (JS + CSS) is inlined into a single
 * index.html so the extension host can serve it with zero asset rewriting.
 */
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    cssCodeSplit: false,
    target: "es2022",
  },
});
