import { createApp } from "vue";
import { InspectorApp } from "@just-inspector/inspector-ui";
import "@just-inspector/inspector-ui/style.css";
import { BrowserTransport } from "@just-inspector/client";

/**
 * Standalone browser build of Just Inspector.
 *
 * The whole connection layer is bundled in: the app opens a WebSocket
 * directly to the game's inspector server.
 */

const DEFAULT_URL = "ws://127.0.0.1:8765";
const STORAGE_KEY = "just-inspector:settings";

function loadSettings(): { url: string; autoConnect: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { url?: string; autoConnect?: boolean };
      return { url: parsed.url ?? DEFAULT_URL, autoConnect: parsed.autoConnect ?? false };
    }
  } catch {
    /* ignore */
  }
  return { url: DEFAULT_URL, autoConnect: false };
}

function saveSettings(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, autoConnect: false }));
  } catch {
    /* ignore */
  }
}

const settings = loadSettings();

createApp(InspectorApp, {
  transportFactory: () => new BrowserTransport(),
  initialUrl: settings.url,
  autoConnect: settings.autoConnect,
  onConnected: ({ url }) => saveSettings(url),
}).mount("#app");
