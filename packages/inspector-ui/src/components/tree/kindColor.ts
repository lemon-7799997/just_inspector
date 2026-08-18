/** Map a node kind string to an accent color (rough heuristics). */
export function kindColor(kind?: string): string {
  const k = kind ?? "";
  const lk = k.toLowerCase();
  if (lk.includes("light")) return "#f4d03f";
  if (lk.includes("camera")) return "#5dade2";
  if (lk.includes("sprite") || lk.includes("mesh") || lk.includes("model") || lk.includes("render")) return "#52be80";
  if (lk.includes("audio") || lk.includes("sound")) return "#af7ac5";
  if (lk.includes("text") || lk.includes("label") || lk.includes("ui")) return "#f0b27a";
  if (lk.includes("rigid") || lk.includes("body") || lk.includes("collision") || lk.includes("physics")) return "#f1948a";
  if (lk.includes("node3d") || lk.includes("node2d") || lk.includes("node")) return "#85c1e9";
  if (lk.includes("entity") || lk.includes("entity(")) return "#82e0aa";
  return "#b0b0b0";
}
