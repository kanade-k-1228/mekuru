import type { CollectionPatch, Keyed, PreviewEvent, Resources, SharedPreviewDto, SnapshotEvent, StateDto, WorkerCompilation } from "@mekuru/protocol";

export interface SharedPreview {
  preview: SharedPreviewDto;
  resources: Resources;
}

const applyCollection = <T extends Keyed<unknown>>(before: T[], delta: CollectionPatch<T>): T[] => {
  if (!delta.upsert.length && !delta.remove.length && !delta.order) return before;
  const entries = new Map(before.map((e) => [e.key, e]));
  for (const key of delta.remove) entries.delete(key);
  for (const entry of delta.upsert) entries.set(entry.key, entry);
  const order = delta.order ?? before.map((e) => e.key).filter((key) => entries.has(key));
  if (order.length !== entries.size || new Set(order).size !== order.length || order.some((key) => !entries.has(key)))
    throw new Error("invalid compiler preview order");
  return order.map((key) => entries.get(key) as T);
};

/** Retain a reconnect snapshot by applying Rust's patch; never diff or encode the full scene on an edit. */
export const acceptPreview = (before: SharedPreview | null, result: WorkerCompilation): SharedPreview | null => {
  const { update, previewVersion } = result;
  if (!update) {
    if (previewVersion !== null && previewVersion !== before?.preview.version) throw new Error("missing compiler preview update");
    return before;
  }
  if (previewVersion === null) throw new Error("failed compilation included a preview update");
  let preview: SharedPreviewDto;
  let resources: Resources;
  if (update.type === "snapshot") {
    if (!update.preview) throw new Error("missing compiler preview");
    preview = update.preview;
    resources = update.resources;
  } else if (update.type === "patch") {
    if (!before || before.preview.version !== update.baseVersion || update.version <= update.baseVersion) throw new Error("compiler preview version mismatch");
    preview = {
      ...update.scene,
      version: update.version,
      elements: applyCollection(before.preview.elements, update.elements),
      timeline: {
        nodes: applyCollection(before.preview.timeline.nodes, update.nodes),
        clips: applyCollection(before.preview.timeline.clips, update.clips),
      },
    };
    resources = { ...before.resources, ...update.resources };
    for (const key of update.removedResources) delete resources[key];
  } else throw new Error("unknown compiler preview update");
  if (preview.version !== previewVersion || previewVersion !== result.version) throw new Error("compiler preview version mismatch");
  for (const entries of [preview.elements, preview.timeline.nodes, preview.timeline.clips]) {
    if (entries.some((e) => !e.key) || new Set(entries.map((e) => e.key)).size !== entries.length) throw new Error("invalid compiler preview keys");
  }
  const kept: Resources = {};
  for (const element of preview.elements) {
    if (!Array.isArray(element.drawings)) throw new Error("missing compiler drawings");
    for (const key of element.drawings) {
      if (!Object.hasOwn(resources, key) || !Array.isArray(resources[key])) throw new Error(`missing drawing resource: ${key}`);
      kept[key] = resources[key];
    }
  }
  return { preview, resources: kept };
};

export const snapshot = (state: StateDto, shared: SharedPreview | null): SnapshotEvent => ({
  type: "snapshot",
  state,
  preview: shared?.preview ?? null,
  resources: shared?.resources ?? {},
});
export const serializeEvent = (event: PreviewEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
