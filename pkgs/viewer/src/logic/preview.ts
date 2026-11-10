import type { CollectionPatch, PatchEvent, PreviewDto, Resources, SnapshotEvent } from "../protocol";

export const previewSocketUrl = (href: string): string => {
  const url = new URL("/api/ws", href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
};

export interface PreviewState {
  preview: PreviewDto | null;
  resources: Resources;
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const applyCollection = <T extends { key: string }>(before: T[], delta: CollectionPatch<T>): T[] => {
  if (!delta.upsert.length && !delta.remove.length && !delta.order) return before;
  const entries = new Map(before.map((entry) => [entry.key, entry]));
  for (const key of delta.remove) entries.delete(key);
  for (const entry of delta.upsert) entries.set(entry.key, entry);
  const order = delta.order ?? before.map((e) => e.key).filter((key) => entries.has(key));
  if (order.length !== entries.size || new Set(order).size !== order.length || order.some((key) => !entries.has(key)))
    throw new Error("invalid preview order; reconnecting");
  return order.map((key) => entries.get(key) as T);
};

const reuse = <T extends { key: string }>(before: T[], incoming: T[]): T[] => {
  const old = new Map(before.map((entry) => [entry.key, entry]));
  const next = incoming.map((entry) => {
    const previous = old.get(entry.key);
    return previous && equal(previous, entry) ? previous : entry;
  });
  return next.length === before.length && next.every((entry, i) => entry === before[i]) ? before : next;
};

/** Applies an event atomically, keeping unchanged elements, nodes, clips and resources by reference; throws instead of returning a partial state. */
export const applyEvent = ({ preview, resources }: PreviewState, event: SnapshotEvent | PatchEvent): PreviewState => {
  let next: PreviewDto | null;
  if (event.type === "snapshot") {
    next = event.preview;
    if (next && preview)
      next = {
        ...next,
        elements: reuse(preview.elements, next.elements),
        nodes: reuse(preview.nodes, next.nodes),
        clips: reuse(preview.clips, next.clips),
      };
  } else {
    if (!preview || preview.version !== event.baseVersion || event.version <= event.baseVersion) throw new Error("preview version mismatch; reconnecting");
    next = {
      ...event.scene,
      version: event.version,
      elements: applyCollection(preview.elements, event.elements),
      nodes: applyCollection(preview.nodes, event.nodes),
      clips: applyCollection(preview.clips, event.clips),
    };
  }
  const kept: Resources = {};
  for (const key of new Set(next?.elements.flatMap((element) => element.drawings))) {
    const ops = Object.hasOwn(resources, key) ? resources[key] : event.resources[key];
    if (!Array.isArray(ops)) throw new Error(`missing drawing resource: ${key}`);
    kept[key] = ops;
  }
  return { preview: next, resources: kept };
};
