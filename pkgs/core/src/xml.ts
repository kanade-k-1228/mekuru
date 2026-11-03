import { normalize, num, type X } from "./normalize.ts";
import { expand, type Element, type Item } from "./expand.ts";
export { fps, resolveText, type TextRun } from "./expand.ts";
import { builds, context } from "./context.ts";

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

const renderXml = async (video: unknown): Promise<string> => {
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

export const toXml = (video: unknown): Promise<string> => (builds.getStore() ? renderXml(video) : builds.run(context(), () => renderXml(video)));
