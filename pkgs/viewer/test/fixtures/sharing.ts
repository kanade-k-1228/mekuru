import { isDeepStrictEqual } from "node:util";
import type { FixtureCompilation } from "./preview.ts";
import type { CollectionPatch, Keyed, PatchEvent, Resources, PreviewDto, SnapshotEvent, StateDto } from "@mekuru/protocol";

export interface SharedPreview {
  preview: PreviewDto;
  resources: Resources;
}

/** Accept only a published success and retain exactly its referenced resources. */
export const sharePreview = (result: FixtureCompilation, previous: SharedPreview | null): SharedPreview => {
  if (!result.preview) throw new Error("missing preview");
  const resources: Resources = {};
  for (const key of new Set(result.preview.elements.flatMap((e) => e.drawings))) {
    const ops = Object.hasOwn(result.resources, key) ? result.resources[key] : previous?.resources[key];
    if (!ops) throw new Error(`missing drawing resource: ${key}`);
    resources[key] = ops;
  }
  return { preview: { ...result.preview, version: result.version }, resources };
};

const same = isDeepStrictEqual;
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
  };
};
