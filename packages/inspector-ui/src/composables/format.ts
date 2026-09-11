/**
 * Inspector-side display helpers (formatting only — no game/protocol state).
 */

/**
 * Turn a machine field name into a spaced UpperCamelCase label:
 * `field_center` -> "Field Center", `soilTextureScale` -> "Soil Texture Scale".
 *
 * Words are detected at `_` / `-` / whitespace boundaries and at
 * lower-to-upper camel transitions. Only the first letter of each word is
 * forced to upper case; the rest is left untouched, so acronyms survive
 * (`fovY` -> "Fov Y", `rgbaColor` -> "Rgba Color").
 *
 * This is the transform behind the inspector's global "PascalCase field names"
 * setting (on by default); explicit `displayName`s from the game always win.
 */
export function humanizeFieldName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\-\s]+/)
    .filter(Boolean);
  if (words.length === 0) return name;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
