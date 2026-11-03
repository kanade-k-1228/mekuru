import { attributes } from "./normalize.ts";
import { expand, type Element, type Item } from "./expand.ts";
export { fps, resolveText, type TextRun } from "./expand.ts";
import { builds, context } from "./context.ts";

const escapeXml = (s: string, quote: boolean) =>
  s.replace(
    quote ? /[&<>"\n\r\t]/g : /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\n": "&#10;", "\r": "&#13;", "\t": "&#9;" })[c] ?? c,
  );

const head = (element: Element) =>
  `<${element.tag}${attributes(element.tag, element.props)
    .map(([key, value]) => ` ${key}="${escapeXml(value, true)}"`)
    .join("")}`;

const serialize = (element: Element, indent = "", compact = false): string => {
  const children = element.children.filter((child) => typeof child !== "string" || element.tag === "text" || child.trim());
  const opening = `${indent}${head(element)}`;
  if (!children.length) return `${opening}/>`;
  const inline = compact || children.some((child) => typeof child === "string");
  const body = children.map((child) => (typeof child === "string" ? escapeXml(child, false) : serialize(child, inline ? "" : `${indent}  `, inline)));
  return inline ? `${opening}>${body.join("")}</${element.tag}>` : `${opening}>\n${body.join("\n")}\n${indent}</${element.tag}>`;
};

const renderXml = async (video: unknown): Promise<string> => {
  const top: Item[] = [];
  await expand(video, top);
  const root = top.find((i): i is Element => typeof i !== "string");
  if (top.length !== 1 || !root || root.tag !== "mekuru") throw new Error("writeXml takes a video: one `<mekuru>` element");
  return `${serialize({ ...root, children: [{ tag: "seq", props: {}, children: root.children }] })}\n`;
};

export const toXml = (video: unknown): Promise<string> => (builds.getStore() ? renderXml(video) : builds.run(context(), () => renderXml(video)));
