import type { CollectionPatch, Keyed, PatchEvent, PreviewDto, Resources, SceneElement, SharedPreviewDto, SnapshotEvent } from "@mekuru/protocol";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const applyCollection = <T extends Keyed<unknown>>(before: T[], delta: CollectionPatch<T>): T[] => {
  if (!delta.upsert.length && !delta.remove.length && !delta.order) return before;
  const entries = new Map(before.map((entry) => [entry.key, entry]));
  for (const key of delta.remove) entries.delete(key);
  for (const entry of delta.upsert) entries.set(entry.key, entry);
  const order = delta.order ?? before.map((e) => e.key).filter((key) => entries.has(key));
  if (order.length !== entries.size || new Set(order).size !== order.length || order.some((key) => !entries.has(key)))
    throw new Error("invalid preview order; reconnecting");
  return order.map((key) => entries.get(key) as T);
};

/** Applies a complete event transaction before replacing any state or cache. */
export const previewStore = () => {
  let shared: SharedPreviewDto | null = null;
  let resources: Resources = {};
  let preview: PreviewDto | null = null;
  const materialize = (next: SharedPreviewDto, incoming: Resources): PreviewDto => {
    const kept: Resources = {};
    for (const key of new Set(next.elements.flatMap((e) => e.drawings))) {
      const ops = Object.hasOwn(resources, key) ? resources[key] : incoming[key];
      if (!Array.isArray(ops)) throw new Error(`missing drawing resource: ${key}`);
      kept[key] = ops;
    }
    const oldShared = new Map(shared?.elements.map((e) => [e.key, e]));
    const oldElements = new Map(preview?.elements.map((e) => [e.key, e]));
    const elements = next.elements.map((entry): SceneElement => {
      const old = oldElements.get(entry.key);
      if (old && equal(oldShared.get(entry.key), entry)) return old;
      const { drawings, ...rest } = entry;
      const oldChunks = new Map(old?.chunks?.map((c) => [c.id, c]));
      return { ...rest, ops: [], chunks: drawings.map((id) => oldChunks.get(id) ?? { id, ops: kept[id] }) };
    });
    const sameElements = preview && elements.length === preview.elements.length && elements.every((e, i) => e === preview?.elements[i]);
    const timeline = preview && equal(shared?.timeline, next.timeline) ? preview.timeline : next.timeline;
    const result: PreviewDto = {
      width: next.width,
      height: next.height,
      fps: next.fps,
      duration: next.duration,
      elements: sameElements && preview ? preview.elements : elements,
      timeline,
    };
    resources = kept;
    shared = next;
    preview = result;
    return result;
  };
  return {
    apply(event: SnapshotEvent | PatchEvent): PreviewDto | null {
      if (event.type === "snapshot") {
        if (!event.preview) {
          shared = null;
          resources = {};
          preview = null;
          return null;
        }
        return materialize(event.preview, event.resources);
      }
      if (!shared || shared.version !== event.baseVersion || event.version <= event.baseVersion) throw new Error("preview version mismatch; reconnecting");
      const next: SharedPreviewDto = {
        ...event.scene,
        version: event.version,
        elements: applyCollection(shared.elements, event.elements),
        timeline: { nodes: applyCollection(shared.timeline.nodes, event.nodes), clips: applyCollection(shared.timeline.clips, event.clips) },
      };
      return materialize(next, event.resources);
    },
  };
};
