import { expect, test } from "bun:test";
import { patch, sharePreview, snapshot } from "../../cli/test/fixtures/sharing.ts";
import { compilation, element, resources, state } from "../../cli/test/fixtures/preview.ts";
import type { PreviewDto } from "@mekuru/protocol";
import { previewStore } from "../src/logic/preview";

const present = (p: PreviewDto | null): PreviewDto => {
  if (!p) throw new Error("missing preview");
  return p;
};

test("patches atomically, keeping unchanged elements, chunks and timeline references", () => {
  const store = previewStore();
  const a = sharePreview(compilation(), null);
  const first = present(store.apply(snapshot(state(), a)));
  const b = sharePreview(compilation(2, [element("e0", ["A", "C"]), element("e1", ["A"], 1)], { C: resources.C }), a);
  const second = present(store.apply(patch(state(2), a, b)));
  expect(second.elements[1]).toBe(first.elements[1]);
  expect(second.elements[0]).not.toBe(first.elements[0]);
  expect(second.elements[0].chunks?.[0]).toBe(first.elements[0].chunks?.[0]);
  expect(second.elements[0].chunks?.[1].ops).toEqual(resources.C);
  expect(second.timeline).toBe(first.timeline);
  const c = sharePreview(compilation(3, b.preview.elements, {}), b);
  const third = present(store.apply(patch(state(3), b, c)));
  expect(third.elements).toBe(second.elements);
  expect(third.timeline).toBe(second.timeline);
  // A reconnect also preserves objects despite JSON decoding new copies.
  const again = present(store.apply(structuredClone(snapshot(state(3), c))));
  expect(again.elements).toBe(third.elements);
});

test("reordering media retains stable identity even when sequential IR IDs change", () => {
  const store = previewStore();
  const media = { ...element("e1", []), kind: "video" as const, media: { src: "a.mp4", gain: 1, map: { from: 0, end: 1, segments: [] } } };
  const a = sharePreview(compilation(1, [element("e0", ["A"]), media]), null);
  const first = present(store.apply(snapshot(state(), a)));
  const b = sharePreview(compilation(2, [{ ...media, id: 2 }, element("e0", ["A"])], {}), a);
  const second = present(store.apply(patch(state(2), a, b)));
  expect(second.elements[0].key).toBe(first.elements[1].key);
  expect(second.elements[1]).toBe(first.elements[0]);
});

test("rejects missing resources and version mismatch without corrupting the previous cache", () => {
  const store = previewStore();
  const a = sharePreview(compilation(), null);
  const first = present(store.apply(snapshot(state(), a)));
  const b = sharePreview(compilation(2, [element("e0", ["C"])], { C: resources.C }), a);
  const delta = patch(state(2), a, b);
  expect(() => store.apply({ ...delta, baseVersion: 99 })).toThrow("version mismatch");
  expect(() => store.apply({ ...delta, resources: {} })).toThrow("missing drawing");
  expect(() => store.apply({ ...delta, elements: { ...delta.elements, order: ["missing"] } })).toThrow("invalid preview order");
  const restored = present(store.apply(snapshot(state(), a)));
  expect(restored.elements).toBe(first.elements);
  store.apply(delta);
  // B was pruned: a later patch must supply it again.
  const c = sharePreview(compilation(3, [element("e0", ["B"])], { B: resources.B }), b);
  expect(() => store.apply({ ...patch(state(3), b, c), resources: {} })).toThrow("missing drawing");
  expect(store.apply(snapshot(state(3), c))?.elements[0].chunks?.[0].ops).toEqual(resources.B);
});
