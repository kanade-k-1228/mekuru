import type { CollectionPatch, Keyed, PatchEvent, PreviewDto, Resources, SnapshotEvent } from "../protocol";

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

export const previewStore = () => {
  let preview: PreviewDto | null = null;
  let resources: Resources = {};
  const reuse = <T extends Keyed<unknown>>(before: T[], incoming: T[]): T[] => {
    const old = new Map(before.map((entry) => [entry.key, entry]));
    const next = incoming.map((entry) => {
      const previous = old.get(entry.key);
      return previous && equal(previous, entry) ? previous : entry;
    });
    return next.length === before.length && next.every((entry, i) => entry === before[i]) ? before : next;
  };
  return {
    get resources() {
      return resources;
    },
    apply(event: SnapshotEvent | PatchEvent): PreviewDto | null {
      let next: PreviewDto | null;
      if (event.type === "snapshot") {
        next = event.preview;
        if (next && preview)
          next = {
            ...next,
            elements: reuse(preview.elements, next.elements),
            timeline: equal(preview.timeline, next.timeline) ? preview.timeline : next.timeline,
          };
      } else {
        if (!preview || preview.version !== event.baseVersion || event.version <= event.baseVersion) throw new Error("preview version mismatch; reconnecting");
        const before = preview;
        const nodes = applyCollection(before.timeline.nodes, event.nodes);
        const clips = applyCollection(before.timeline.clips, event.clips);
        next = {
          ...event.scene,
          version: event.version,
          elements: applyCollection(before.elements, event.elements),
          timeline: nodes === before.timeline.nodes && clips === before.timeline.clips ? before.timeline : { nodes, clips },
        };
      }
      const kept: Resources = {};
      for (const key of new Set(next?.elements.flatMap((element) => element.drawings))) {
        const ops = Object.hasOwn(resources, key) ? resources[key] : event.resources[key];
        if (!Array.isArray(ops)) throw new Error(`missing drawing resource: ${key}`);
        kept[key] = ops;
      }
      resources = kept;
      preview = next;
      return preview;
    },
  };
};
