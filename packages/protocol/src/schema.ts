/**
 * Node tree / property schema — what the game sends in response to
 * `Runtime.getTree` / `Runtime.getNode`.
 */

import type { EnumOption, TaggedValue } from "./values";

/**
 * Which input control the UI should render for a property.
 * "auto" = derive from the value type.
 */
export type ControlKind =
  | "auto"
  | "text"
  | "number"
  | "slider"
  | "dropdown"
  | "checkbox"
  | "color"
  | "curve"
  | "vector"
  | "array"
  | "object"
  | "asset";

/** Optional per-property hints that tune a control. */
export interface PropertyHint {
  /** slider/number: min value */
  min?: number;
  /** slider/number: max value */
  max?: number;
  /** slider/number: step */
  step?: number;
  /** dropdown: alternative to options embedded in an enum value */
  options?: EnumOption[];
  /** text: multi-line input */
  multiline?: boolean;
  /** text: placeholder */
  placeholder?: string;
  /** curve: value axis range */
  valueMin?: number;
  valueMax?: number;
  /** curve: time axis range */
  timeMin?: number;
  timeMax?: number;
  /** curve: allow adding/removing points */
  curveEditable?: boolean;
}

export interface PropertyDescriptor {
  /** Machine name (used as `property` in Runtime.setValue). */
  name: string;
  /** Optional friendly label. */
  displayName?: string;
  /** Control hint. Defaults to "auto". */
  control?: ControlKind;
  value: TaggedValue;
  hint?: PropertyHint;
  readOnly?: boolean;
  tooltip?: string;
}

/** Lightweight tree node (no property data). */
export interface TreeNode {
  id: string;
  name: string;
  /** e.g. "Node3D", "Camera3D", "Sprite", "Entity(Player)" */
  kind?: string;
  children?: TreeNode[];
}

/** Full property data for one node. */
export interface NodeDetail {
  id: string;
  name: string;
  kind?: string;
  /** Scene-tree path, e.g. "/root/World/Player". */
  path?: string;
  properties: PropertyDescriptor[];
}

/** Game identity reported by `Inspector.hello` / the `Inspector.ready` event. */
export interface GameInfo {
  gameName: string;
  /** "godot" | "bevy" | "unity" | "custom" | ... */
  engine: string;
  engineVersion?: string;
  protocolVersion: string;
  capabilities?: string[];
}
