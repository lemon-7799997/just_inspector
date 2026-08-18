/**
 * Tagged value encoding — every runtime value crossing the wire is self-describing.
 *
 * The game is responsible for producing these; the UI renders whatever `type` it
 * sees. Unknown types are rendered as JSON to stay forward compatible.
 */

export type ValueType =
  | "null"
  | "int"
  | "float"
  | "bool"
  | "string"
  | "color"
  | "enum"
  | "vec2"
  | "vec3"
  | "vec4"
  | "curve"
  | "array"
  | "object"
  | "asset";

export interface NullValue {
  type: "null";
}
export interface IntValue {
  type: "int";
  value: number;
}
export interface FloatValue {
  type: "float";
  value: number;
}
export interface BoolValue {
  type: "bool";
  value: boolean;
}
export interface StringValue {
  type: "string";
  value: string;
}
/** RGBA in 0..1 floats (CSS-like; convert to 0..255 for pickers). */
export interface ColorValue {
  type: "color";
  r: number;
  g: number;
  b: number;
  a: number;
}
export interface EnumOption {
  /** Stable machine value. */
  value: string | number;
  /** Optional display label; falls back to the value. */
  label?: string;
}
export interface EnumValue {
  type: "enum";
  value: string | number;
  options: EnumOption[];
}
export interface Vec2Value {
  type: "vec2";
  x: number;
  y: number;
}
export interface Vec3Value {
  type: "vec3";
  x: number;
  y: number;
  z: number;
}
export interface Vec4Value {
  type: "vec4";
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Animation curve. `x` is time, `y` is value. Tangent handles `lx/ly` (left) and
 * `rx/ry` (right) are offsets in (time, value) units, matching Godot's
 * `Curve.set_point_left_tangent/right_tangent` semantics and Unity's
 * `Keyframe.inTangent/outTangent` style.
 */
export interface CurvePoint {
  x: number;
  y: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}
export interface CurveValue {
  type: "curve";
  points: CurvePoint[];
  /** "bezier" (tangent-based) or "linear" (straight segments). */
  mode?: "bezier" | "linear";
}

export interface ArrayValue {
  type: "array";
  /** Hint about the element type (not enforced). */
  itemType?: ValueType;
  items: TaggedValue[];
}

export interface ObjectValue {
  type: "object";
  fields: Record<string, TaggedValue>;
}

export interface AssetValue {
  type: "asset";
  /** e.g. "texture" | "audio" | "scene" | "script" ... */
  kind?: string;
  /** Engine-local path, e.g. "res://icon.png" (Godot) or "assets/player.png" (Bevy). */
  path?: string;
}

export type TaggedValue =
  | NullValue
  | IntValue
  | FloatValue
  | BoolValue
  | StringValue
  | ColorValue
  | EnumValue
  | Vec2Value
  | Vec3Value
  | Vec4Value
  | CurveValue
  | ArrayValue
  | ObjectValue
  | AssetValue;

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

export const nullValue = (): NullValue => ({ type: "null" });
export const int = (value: number): IntValue => ({ type: "int", value: Math.trunc(value) });
export const float = (value: number): FloatValue => ({ type: "float", value });
export const str = (value: string): StringValue => ({ type: "string", value });
export const bool = (value: boolean): BoolValue => ({ type: "bool", value });
export const color = (r: number, g: number, b: number, a = 1): ColorValue => ({ type: "color", r, g, b, a });
export const enumValue = (value: string | number, options: EnumOption[]): EnumValue => ({ type: "enum", value, options });
export const vec2 = (x: number, y: number): Vec2Value => ({ type: "vec2", x, y });
export const vec3 = (x: number, y: number, z: number): Vec3Value => ({ type: "vec3", x, y, z });
export const vec4 = (x: number, y: number, z: number, w: number): Vec4Value => ({ type: "vec4", x, y, z, w });
export const curve = (points: CurvePoint[], mode: "bezier" | "linear" = "bezier"): CurveValue => ({ type: "curve", points, mode });
export const array = (items: TaggedValue[], itemType?: ValueType): ArrayValue => ({ type: "array", items, ...(itemType ? { itemType } : {}) });
export const object = (fields: Record<string, TaggedValue>): ObjectValue => ({ type: "object", fields });
export const asset = (kind?: string, path?: string): AssetValue => ({ type: "asset", ...(kind ? { kind } : {}), ...(path ? { path } : {}) });

/* ------------------------------------------------------------------ */
/* Guards & helpers                                                    */
/* ------------------------------------------------------------------ */

const TYPES = new Set<ValueType>([
  "null", "int", "float", "bool", "string", "color", "enum",
  "vec2", "vec3", "vec4", "curve", "array", "object", "asset",
]);

export function isTaggedValue(v: unknown): v is TaggedValue {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in (v as Record<string, unknown>) &&
    TYPES.has((v as { type: string }).type as ValueType)
  );
}

export function valueTypeOf(v: TaggedValue): ValueType {
  return v.type;
}

/** True for int/float/bool/string/null — the "scalar" family. */
export function isScalarValue(v: TaggedValue): boolean {
  return v.type === "int" || v.type === "float" || v.type === "bool" || v.type === "string" || v.type === "null";
}

/** Human-readable short summary of a value (for logs / fallback rows). */
export function describeValue(v: TaggedValue): string {
  switch (v.type) {
    case "null":
      return "null";
    case "int":
    case "float":
    case "bool":
      return String(v.value);
    case "string":
      return JSON.stringify(v.value);
    case "color":
      return `rgba(${Math.round(v.r * 255)}, ${Math.round(v.g * 255)}, ${Math.round(v.b * 255)}, ${v.a.toFixed(2)})`;
    case "enum":
      return `${v.value} (${v.options.map((o) => o.label ?? o.value).join(", ")})`;
    case "vec2":
      return `(${fmt(v.x)}, ${fmt(v.y)})`;
    case "vec3":
      return `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;
    case "vec4":
      return `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}, ${fmt(v.w)})`;
    case "curve":
      return `${v.points.length} pt`;
    case "array":
      return `${v.items.length} items`;
    case "object": {
      const keys = Object.keys(v.fields);
      return `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""} }`;
    }
    case "asset":
      return v.path ?? v.kind ?? "asset";
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

/** Convert a value to a plain JSON-serializable object (curves/colors already are). */
export function toPlain(v: TaggedValue): unknown {
  return v as unknown;
}
