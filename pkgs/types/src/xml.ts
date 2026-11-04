import { rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { attributes } from "./normalize.ts";
import { expand, type Element, type Item } from "./expand.ts";
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

export const writeXml = async (path: string, video: unknown): Promise<void> => {
  const build = context(true);
  const file = resolve(build.root, path);
  await builds.run(build, async () => {
    const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const save = async () => {
      await Bun.write(tmp, await renderXml(video));
      await rename(tmp, file);
    };
    try {
      await save();
      build.draft = false;
      if (build.waits.size === 0) return;
      await Promise.all(build.waits);
      await save();
    } finally {
      build.draft = false;
      build.waits.clear();
      await rm(tmp, { force: true });
    }
  });
};
