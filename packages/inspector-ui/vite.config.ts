import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "JustInspectorUI",
      formats: ["es"],
      fileName: "index",
      cssFileName: "style",
    },
    rollupOptions: {
      // Consumers (web app / VS Code webview) provide these.
      external: ["vue", "@just-inspector/client", "@just-inspector/protocol"],
    },
    sourcemap: true,
  },
});
