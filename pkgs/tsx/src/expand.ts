import { AsyncLocalStorage } from "node:async_hooks";
type Props = Record<string, unknown>;

export interface Element {
  tag: string;
  props: Props;
  children: Element[];
}
export type Item = Element | string;

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

export const expand = async (node: unknown, out: Item[]): Promise<void> => {
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
      const items: Item[] = [];
      const inside = async () => {
        for (const c of children) await expand(c, items);
      };
      await (tag === "mekuru" ? rate.run(frameRate(props.fps), inside) : inside());
      if (tag === "text" && items.length) throw new Error('`<text>` takes its string in `text` (`<text text="…" />`), not as children');
      const words = items.find((c) => typeof c === "string" && c.trim());
      if (words !== undefined) throw new Error(`text cannot be in \`<${tag}>\`: write it in \`<text text="…" />\` (found ${JSON.stringify(words)})`);
      out.push({ tag, props, children: items.filter((c) => typeof c !== "string") });
      return;
    }
  }
  throw new Error(`a video is made of elements and text, not ${describe(node)}`);
};

/** Expand text components using the same rules as the rest of the video into one string. */
export const resolveText = async (children: unknown): Promise<string> => {
  const items: Item[] = [];
  await expand(children, items);
  return items
    .map((item) => {
      if (typeof item === "string") return item;
      throw new Error(`a line of speech is text, not <${item.tag}>: break a line with "\\n"`);
    })
    .join("");
};
