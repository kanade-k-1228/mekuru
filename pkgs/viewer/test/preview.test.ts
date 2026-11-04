import { expect, test } from "bun:test";
import { compilation, element, patch, resources, sharePreview, snapshot, state } from "./fixtures.ts";
import type { PreviewDto } from "../src/protocol";
import { applyEvent, type PreviewState } from "../src/logic/preview";

const empty: PreviewState = { preview: null, resources: {} };
const present = ({ preview }: PreviewState): PreviewDto => {
  if (!preview) throw new Error("missing preview");
  return preview;
};

test("patches atomically, keeping unchanged elements, resources and timeline references", () => {
  const a = sharePreview(compilation(), null);
  const s1 = applyEvent(empty, snapshot(state(), a));
  const first = present(s1);
  const b = sharePreview(compilation(2, [element("e0", ["A", "C"]), element("e1", ["A"], 1)], { C: resources.C }), a);
  const s2 = applyEvent(s1, patch(state(2), a, b));
  const second = present(s2);
  expect(second.elements[1]).toBe(first.elements[1]);
  expect(second.elements[0]).not.toBe(first.elements[0]);
  expect(s2.resources.A).toBe(s1.resources.A);
  expect(s2.resources[second.elements[0].drawings[1]]).toEqual(resources.C);
  expect(second.timeline).toBe(first.timeline);
  const c = sharePreview(compilation(3, b.preview.elements, {}), b);
  const s3 = applyEvent(s2, patch(state(3), b, c));
  const third = present(s3);
  expect(third.elements).toBe(second.elements);
  expect(third.timeline).toBe(second.timeline);
  // A reconnect also preserves objects despite JSON decoding new copies.
  const again = present(applyEvent(s3, structuredClone(snapshot(state(3), c))));
  expect(again.elements).toBe(third.elements);
});

test("reordering media retains stable identity even when sequential IR IDs change", () => {
  const media = { ...element("e1", []), kind: "video" as const, media: { src: "a.mp4", revision: "r", gain: 1, map: { from: 0, end: 1, segments: [] } } };
  const a = sharePreview(compilation(1, [element("e0", ["A"]), media]), null);
  const s1 = applyEvent(empty, snapshot(state(), a));
  const first = present(s1);
  const b = sharePreview(compilation(2, [{ ...media, id: 2 }, element("e0", ["A"])], {}), a);
  const second = present(applyEvent(s1, patch(state(2), a, b)));
  expect(second.elements[0].key).toBe(first.elements[1].key);
  expect(second.elements[1]).toBe(first.elements[0]);
});

test("rejects missing resources, version mismatch and invalid order; pruned resources must be sent again", () => {
  const a = sharePreview(compilation(), null);
  const s1 = applyEvent(empty, snapshot(state(), a));
  const b = sharePreview(compilation(2, [element("e0", ["C"])], { C: resources.C }), a);
  const delta = patch(state(2), a, b);
  expect(() => applyEvent(s1, { ...delta, baseVersion: 99 })).toThrow("version mismatch");
  expect(() => applyEvent(s1, { ...delta, resources: {} })).toThrow("missing drawing");
  expect(() => applyEvent(s1, { ...delta, elements: { ...delta.elements, order: ["missing"] } })).toThrow("invalid preview order");
  expect(present(applyEvent(s1, snapshot(state(), a))).elements).toBe(present(s1).elements);
  const s2 = applyEvent(s1, delta);
  // B was pruned: a later patch must supply it again.
  const c = sharePreview(compilation(3, [element("e0", ["B"])], { B: resources.B }), b);
  expect(() => applyEvent(s2, { ...patch(state(3), b, c), resources: {} })).toThrow("missing drawing");
  expect(applyEvent(s2, snapshot(state(3), c)).resources.B).toEqual(resources.B);
});
