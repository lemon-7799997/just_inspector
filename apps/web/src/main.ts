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

/**
 * Auto-connect is on by default: the tool is normally opened to inspect a
 * game that is (or is about to be) running on the default port. If the game
 * is not up yet the client just keeps retrying in the background.
 */
const AUTO_CONNECT_DEFAULT = true;

function loadSettings(): { url: string; autoConnect: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { url?: string; autoConnect?: boolean };
      return { url: parsed.url ?? DEFAULT_URL, autoConnect: parsed.autoConnect ?? AUTO_CONNECT_DEFAULT };
    }
  } catch {
    /* ignore */
  }
  return { url: DEFAULT_URL, autoConnect: AUTO_CONNECT_DEFAULT };
}

function saveSettings(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, autoConnect: AUTO_CONNECT_DEFAULT }));
  } catch {
    /* ignore */
  }
}

const settings = loadSettings();

createApp(InspectorApp, {
  transportFactory: () => new BrowserTransport(),
  initialUrl: settings.url,
  autoConnect: settings.autoConnect,
  // Explicit type: `createApp`'s rootProps is a loose Record, so destructured
  // params need their own annotation to avoid TS7031.
  onConnected: ({ url }: { url: string }) => saveSettings(url),
}).mount("#app");
