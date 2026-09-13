import type { Transport } from "@just-inspector/client";

/**
 * User-chosen dock side for the scene tree panel, relative to the property grid.
 *
 * Only the two horizontal sides can be picked. The vertical layout is no longer
 * a choice: a window taller than it is wide (portrait) stacks the tree above /
 * below the grid automatically — see [`TreeDockSide`].
 */
export type TreeDockPosition = "left" | "right";

/**
 * The dock side that is actually rendered: [`TreeDockPosition`] while the window
 * is landscape, mapped to a full-width strip while it is portrait (`left` ->
 * `top`, `right` -> `bottom`). The side panel and the property grid do not fit
 * side by side on a narrow window, so the shell stacks them instead.
 */
export type TreeDockSide = "left" | "right" | "top" | "bottom";

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
