import type {
  CollectionPatch,
  Keyed,
  PatchEvent,
  PreviewEvent,
  Resources,
  SharedPreviewDto,
  SnapshotEvent,
  StateDto,
  WorkerCompilation,
} from "@mekuru/protocol";

export interface SharedPreview {
  preview: SharedPreviewDto;
  resources: Resources;
}

/** Accept only a published success and retain exactly its referenced resources. */
export const sharePreview = (result: WorkerCompilation, previous: SharedPreview | null): SharedPreview => {
  if (!result.preview) throw new Error("missing preview");
  const resources: Resources = {};
  for (const key of new Set(result.preview.elements.flatMap((e) => e.drawings))) {
    const ops = Object.hasOwn(result.resources, key) ? result.resources[key] : previous?.resources[key];
    if (!ops) throw new Error(`missing drawing resource: ${key}`);
    resources[key] = ops;
  }
  return { preview: { ...result.preview, version: result.version }, resources };
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const sameScene = (before: SharedPreview, after: SharedPreview): boolean => {
  return same({ ...before.preview, version: 0 }, { ...after.preview, version: 0 });
};
export const collectionPatch = <T extends Keyed<unknown>>(before: T[], after: T[]): CollectionPatch<T> => {
  const old = new Map(before.map((e) => [e.key, e]));
  const next = new Set(after.map((e) => e.key));
  const order = after.map((e) => e.key);
  return {
    upsert: after.filter((e) => !same(old.get(e.key), e)),
    remove: before.filter((e) => !next.has(e.key)).map((e) => e.key),
    ...(same(
      before.map((e) => e.key),
      order,
    )
      ? {}
      : { order }),
  };
};
export const snapshot = (state: StateDto, shared: SharedPreview | null): SnapshotEvent => ({
  type: "snapshot",
  state,
  preview: shared?.preview ?? null,
  resources: shared?.resources ?? {},
});
export const patch = (state: StateDto, before: SharedPreview, after: SharedPreview): PatchEvent => {
  const a = before.preview;
  const b = after.preview;
  return {
    type: "patch",
    state,
    baseVersion: a.version,
    version: b.version,
    scene: { width: b.width, height: b.height, fps: b.fps, duration: b.duration },
    elements: collectionPatch(a.elements, b.elements),
    nodes: collectionPatch(a.timeline.nodes, b.timeline.nodes),
    clips: collectionPatch(a.timeline.clips, b.timeline.clips),
    resources: Object.fromEntries(Object.entries(after.resources).filter(([key]) => !Object.hasOwn(before.resources, key))),
    removedResources: Object.keys(before.resources).filter((key) => !Object.hasOwn(after.resources, key)),
  };
};
export const serializeEvent = (event: PreviewEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
// Account for the full event without serializing unchanged path data on each edit.
const resourceLengths = new WeakMap<object, number>();
const resourceLength = (ops: Resources[string]) => {
  let length = resourceLengths.get(ops);
  if (length === undefined) {
    length = Buffer.byteLength(JSON.stringify(ops));
    resourceLengths.set(ops, length);
  }
  return length;
};
/** The selected event is serialized once, then broadcast verbatim to all viewers. */
export const previewEvent = (state: StateDto, before: SharedPreview | null, after: SharedPreview): string => {
  if (!before) return serializeEvent(snapshot(state, after));
  const delta = serializeEvent(patch(state, before, after));
  const entries = Object.entries(after.resources);
  const fullSize =
    Buffer.byteLength(serializeEvent({ ...snapshot(state, after), resources: {} })) +
    entries.reduce((size, [key, ops]) => size + Buffer.byteLength(JSON.stringify(key)) + 1 + resourceLength(ops), 0) +
    Math.max(0, entries.length - 1);
  return Buffer.byteLength(delta) < fullSize ? delta : serializeEvent(snapshot(state, after));
};
