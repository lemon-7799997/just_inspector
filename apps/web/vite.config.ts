import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // Relative asset paths so the built `dist/` works from any static server
  // AND by double-clicking index.html directly (file://) — no server needed.
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
  },
});
