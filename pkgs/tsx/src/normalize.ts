const TIMES = new Set(["len", "fadein", "fadeout", "from", "to", "delay"]);
const LENGTHS = new Set(["x", "y", "w", "h", "min-w", "max-w", "min-h", "max-h", "gap"]);
const RATIOS = new Set(["opacity", "volume"]);
const COLORS = new Set(["fill", "stroke", "color", "background"]);

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  lime: "#00FF00",
  green: "#008000",
  blue: "#0000FF",
  yellow: "#FFFF00",
  cyan: "#00FFFF",
  aqua: "#00FFFF",
  magenta: "#FF00FF",
  fuchsia: "#FF00FF",
  gray: "#808080",
  grey: "#808080",
  silver: "#C0C0C0",
  maroon: "#800000",
  olive: "#808000",
  purple: "#800080",
  teal: "#008080",
  navy: "#000080",
  orange: "#FFA500",
  transparent: "#00000000",
  none: "#00000000",
};

const ANCHORS: Record<string, string> = { center: "c", top: "t", bottom: "b", left: "l", right: "r" };

/** Numbers without exponents, anything else as it is. */
const str = (v: unknown): string => {
  const s = String(v);
  return typeof v === "number" && /e/i.test(s) && Math.abs(v) < 1 ? v.toFixed(20).replace(/\.?0+$/, "") : s;
};

const frames = (v: unknown): string => str(v).trim();

const ratio = (v: unknown): string => {
  if (typeof v === "number") return str(v);
  const s = String(v).trim();
  const pct = /^(-?[\d.]+)%$/.exec(s);
  return pct ? str(Number(pct[1]) / 100) : s;
};

const color = (v: unknown): string => NAMED[String(v).trim().toLowerCase()] ?? String(v).trim();

const at = (v: unknown): [string, string] => {
  const s = typeof v === "string" ? v.trim() : v;
  if (typeof s !== "string" || !/^[\p{L}_]/u.test(s)) return ["delay", frames(s)];
  const [id, q] = s.includes(":") ? [s.slice(0, s.indexOf(":")), s.slice(s.indexOf(":") + 1)] : [s, "0"];
  return ["at", `${id.trim()}:${frames(q)}`];
};

const attr = (tag: string, key: string, v: unknown): [string, string] | undefined => {
  if (key === "at") return tag === "hold" ? ["at", frames(v)] : at(v);
  if (typeof v === "boolean") return key === "grow" ? [key, v ? "1" : "0"] : v ? [key, "true"] : undefined;
  if (TIMES.has(key)) return [key, frames(v)];
  if (LENGTHS.has(key)) return [key, str(v)];
  if (RATIOS.has(key)) return [key, ratio(v)];
  if (COLORS.has(key)) return [key, color(v)];
  if (key === "padding") return [key, (Array.isArray(v) ? v : [v]).map(str).join(" ")];
  if (key === "anchor") return [key, ANCHORS[String(v)] ?? String(v)];
  return [key, str(v)];
};

export const attributes = (tag: string, props: Record<string, unknown>): [string, string][] =>
  Object.entries(props).flatMap(([key, value]) => {
    if (key === "children" || key === "key" || value === undefined || value === null) return [];
    const pair = attr(tag, key, value);
    return pair ? [pair] : [];
  });
