import { AsyncLocalStorage } from "node:async_hooks";

type Props = Record<string, unknown>;

interface Element {
  tag: string;
  props: Props;
  children: Item[];
}
type Item = Element | string;

interface JsxNode {
  tag: unknown;
  props: Props;
  children: unknown[];
}

const isJsxNode = (v: unknown): v is JsxNode => typeof v === "object" && v !== null && "tag" in v && "props" in v && Array.isArray((v as JsxNode).children);

const describe = (v: unknown): string => (typeof v === "object" && v !== null ? (v.constructor?.name ?? "an object") : typeof v);

const rate = new AsyncLocalStorage<number>();

export const fps = (): number => {
  const f = rate.getStore();
  if (f === undefined) throw new Error("fps() is known only inside `<mekuru>` while writeXml writes it: call it in a component");
  return f;
};

const frameRate = (v: unknown): number => {
  const f = v === undefined ? 30 : Number(v);
  if (!(f > 0 && f <= 240)) throw new Error(`\`<mekuru fps>\` is frames per second, a number above 0 (not ${String(v)})`);
  return f;
};

const expand = async (node: unknown, out: Item[]): Promise<void> => {
  node = await node;
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint" || node instanceof String) {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) await expand(n, out);
    return;
  }
  if (isJsxNode(node)) {
    const { tag, props, children } = node;
    if (typeof tag === "function") {
      const p = { ...props };
      if (children.length) p.children = children.length === 1 ? children[0] : children;
      return expand(await tag(p), out);
    }
    if (tag === "") {
      for (const c of children) await expand(c, out);
      return;
    }
    if (typeof tag === "string") {
      const el: Element = { tag, props, children: [] };
      const inside = async () => {
        for (const c of children) await expand(c, el.children);
      };
      await (tag === "mekuru" ? rate.run(frameRate(props.fps), inside) : inside());
      out.push(el);
      return;
    }
  }
  throw new Error(`a video is made of elements and text, not ${describe(node)}`);
};

interface X {
  tag: string;
  attrs: [string, string][];
  children: (X | string)[];
}

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

const num = (n: number): string => {
  const s = String(n);
  return /e/i.test(s) && Math.abs(n) < 1 ? n.toFixed(20).replace(/\.?0+$/, "") : s;
};

const frames = (v: unknown): string => (typeof v === "number" ? num(v) : String(v).trim());

const length = (v: unknown): string => (typeof v === "number" ? num(v) : String(v));

const ratio = (v: unknown): string => {
  if (typeof v === "number") return num(v);
  const s = String(v).trim();
  const pct = /^(-?[\d.]+)%$/.exec(s);
  return pct ? num(Number(pct[1]) / 100) : s;
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
  if (LENGTHS.has(key)) return [key, length(v)];
  if (RATIOS.has(key)) return [key, ratio(v)];
  if (COLORS.has(key)) return [key, color(v)];
  if (key === "padding") return [key, (Array.isArray(v) ? v : [v]).map(length).join(" ")];
  if (key === "anchor") return [key, ANCHORS[String(v)] ?? String(v)];
  return [key, typeof v === "number" ? num(v) : String(v)];
};

const normalize = (el: Element): X => {
  const x: X = { tag: el.tag, attrs: [], children: [] };
  for (const c of el.children) {
    if (typeof c !== "string") x.children.push(normalize(c));
    else if (el.tag === "text" || c.trim()) x.children.push(c);
  }
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children" || k === "key" || v === undefined || v === null) continue;
    const a = attr(el.tag, k, v);
    if (a) x.attrs.push(a);
  }
  return x;
};

const escapeXml = (s: string, quote: boolean) =>
  s.replace(
    quote ? /[&<>"\n\r\t]/g : /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\n": "&#10;", "\r": "&#13;", "\t": "&#9;" })[c] ?? c,
  );

const head = (x: X) => `<${x.tag}${x.attrs.map(([k, v]) => ` ${k}="${escapeXml(v, true)}"`).join("")}`;

const inline = (c: X | string): string =>
  typeof c === "string" ? escapeXml(c, false) : c.children.length ? `${head(c)}>${c.children.map(inline).join("")}</${c.tag}>` : `${head(c)}/>`;

const write = (x: X, indent: string, out: string[]) => {
  if (x.children.length === 0 || x.children.some((c) => typeof c === "string")) {
    out.push(`${indent}${inline(x)}`);
  } else {
    out.push(`${indent}${head(x)}>`);
    for (const c of x.children) write(c as X, `${indent}  `, out);
    out.push(`${indent}</${x.tag}>`);
  }
};

export const toXml = async (video: unknown): Promise<string> => {
  const top: Item[] = [];
  await expand(video, top);
  const root = top.find((i): i is Element => typeof i !== "string");
  if (top.length !== 1 || !root || root.tag !== "mekuru") throw new Error("writeXml takes a video: one `<mekuru>` element");
  const x: X = { tag: "mekuru", attrs: [], children: [] };
  for (const [k, v] of Object.entries(root.props)) {
    if (k !== "children" && k !== "key" && v !== undefined && v !== null) x.attrs.push([k, typeof v === "number" ? num(v) : String(v)]);
  }
  x.children.push(normalize({ tag: "seq", props: {}, children: root.children }));
  const out: string[] = [];
  write(x, "", out);
  return `${out.join("\n")}\n`;
};
