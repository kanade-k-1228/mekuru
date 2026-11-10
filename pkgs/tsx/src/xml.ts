import { rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { attributes } from "./normalize.ts";
import { expand, type Element, type Item } from "./expand.ts";
import { builds, context } from "./context.ts";

const escapeXml = (s: string) =>
  s.replace(/[&<>"\n\r\t]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\n": "&#10;", "\r": "&#13;", "\t": "&#9;" })[c] ?? c);

const head = (element: Element) =>
  `<${element.tag}${attributes(element.tag, element.props)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("")}`;

/** Text lives in attributes (`<text text="…"/>`), so elements hold only elements. */
const serialize = (element: Element, indent = ""): string => {
  const { children } = element;
  const opening = `${indent}${head(element)}`;
  if (!children.length) return `${opening}/>`;
  return `${opening}>\n${children.map((child) => serialize(child, `${indent}  `)).join("\n")}\n${indent}</${element.tag}>`;
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
      await rm(tmp, { force: true });
    }
  });
};
