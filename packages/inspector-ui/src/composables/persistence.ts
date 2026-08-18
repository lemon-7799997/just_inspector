import type { Transport } from "@just-inspector/client";

/** Where the scene tree panel is docked relative to the property grid. */
export type TreeDockPosition = "left" | "bottom" | "right";

/** Tiny key/value persistence that works in both packaging modes:
 *  - browser: localStorage
 *  - VS Code webview: the extension host's `workspaceState` (via the vscode
 *    `getState`/`setState` API bridged by the webview transport)
 */
export interface Persistence {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

function localStoragePersistence(): Persistence {
  const prefix = "just-inspector:";
  return {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(prefix + key) ?? "null") ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        /* ignore quota / private-mode errors */
      }
    },
  };
}

function vscodeStatePersistence(getState: () => unknown, setState: (state: unknown) => void): Persistence {
  return {
    get(key) {
      const state = (getState() ?? {}) as Record<string, unknown>;
      return state[key] ?? null;
    },
    set(key, value) {
      const state = { ...((getState() ?? {}) as Record<string, unknown>), [key]: value };
      setState(state);
    },
  };
}

/**
 * Pick the right backend for the given transport. Transports that expose
 * `getState`/`setState` (the VS Code webview bridge) use the webview's
 * persistent workspace state; everything else falls back to localStorage.
 */
export function createPersistence(transport: Transport): Persistence {
  const t = transport as unknown as { getState?: () => unknown; setState?: (state: unknown) => void };
  if (typeof t.getState === "function" && typeof t.setState === "function") {
    return vscodeStatePersistence(t.getState, t.setState);
  }
  return localStoragePersistence();
}
