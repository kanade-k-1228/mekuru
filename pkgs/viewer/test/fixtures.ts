import type { CollectionPatch, DrawOp, PatchEvent, PreviewDto, PreviewEvent, Resources, SceneElement, SnapshotEvent, StateDto } from "../src/protocol";

const path = (d: string): DrawOp => ({ kind: "path", d, color: "#000000ff", stroke: null });
export const resources: Resources = { A: [path("M0 0L1 1")], B: [path("M0 0L2 2")], C: [path("M0 0L3 3")] };
export const element = (key: string, drawings: string[], start = 0): SceneElement => ({
  key,
  kind: "view",
  start,
  end: start + 1,
  opacity: 1,
  fades: [],
  drawings,
  bounds: null,
  media: null,
  repeat: [],
  hidden: [],
});
/** A compiler result: `resources` holds only the drawings it newly produced. */
export const compilation = (version = 1, elements = [element("e0", ["A", "B"]), element("e1", ["A"], 1)], available = resources) => ({
  version,
  resources: available,
  preview: { width: 100, height: 100, fps: 30, duration: 2, elements, timeline: { nodes: [], clips: [] } } satisfies Omit<PreviewDto, "version">,
});
export const state = (version = 1): StateDto => ({ title: "video.xml", version, previewVersion: version, status: "ready", error: null, diagnostics: [] });

interface SharedPreview {
  preview: PreviewDto;
  resources: Resources;
}

/** Accept a compilation and retain exactly its referenced resources, like the server. */
export const sharePreview = (result: ReturnType<typeof compilation>, previous: SharedPreview | null): SharedPreview => {
  const resources: Resources = {};
  for (const key of new Set(result.preview.elements.flatMap((e) => e.drawings))) {
    const ops = Object.hasOwn(result.resources, key) ? result.resources[key] : previous?.resources[key];
    if (!ops) throw new Error(`missing drawing resource: ${key}`);
    resources[key] = ops;
  }
  return { preview: { ...result.preview, version: result.version }, resources };
};

const collectionPatch = <T extends { key: string }>(before: T[], after: T[]): CollectionPatch<T> => {
  const old = new Map(before.map((e) => [e.key, e]));
  const next = new Set(after.map((e) => e.key));
  const order = after.map((e) => e.key);
  return {
    upsert: after.filter((e) => !Bun.deepEquals(old.get(e.key), e)),
    remove: before.filter((e) => !next.has(e.key)).map((e) => e.key),
    ...(Bun.deepEquals(
      before.map((e) => e.key),
      order,
    )
      ? {}
      : { order }),
  };
};
export const snapshot = (state: StateDto, shared: SharedPreview): SnapshotEvent => ({ type: "snapshot", state, ...shared });
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
  };
};

/** Records every WebSocket the viewer opens while installed. */
export class Events {
  static all: Events[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor() {
    Events.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  receive(event: PreviewEvent) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  close() {
    this.closed = true;
  }
}
export const install = () => {
  const previous = globalThis.WebSocket;
  Events.all = [];
  globalThis.WebSocket = Events as unknown as typeof WebSocket;
  return () => {
    globalThis.WebSocket = previous;
  };
};
