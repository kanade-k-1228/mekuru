import { expect, test } from "bun:test";
import { patch, previewEvent, serializeEvent, sharePreview } from "../src/share.ts";
import { compilation, element, resources, state } from "./fixtures/preview.ts";

test("shares ViewOp chunks, sends only changed resources, and prunes unused data", () => {
  const first = sharePreview(compilation(), null);
  expect(Object.keys(first.resources).sort()).toEqual(["A", "B"]);
  const second = sharePreview(compilation(2, [element("e0", ["A", "C"]), element("e1", ["A"], 1)], { C: resources.C }), first);
  expect(second.resources.A).toBe(first.resources.A);
  expect(Object.keys(second.resources).sort()).toEqual(["A", "C"]);
  const delta = patch(state(2), first, second);
  expect(delta.resources).toEqual({ C: resources.C });
  expect(delta.removedResources).toEqual(["B"]);
  expect(delta.elements.upsert.map((e) => e.key)).toEqual(["e0"]);
  expect(delta.elements.order).toBeUndefined();
  expect(previewEvent(state(2), first, second)).toStartWith("event: patch\n");
  expect(serializeEvent({ type: "status", state: { ...state(2), status: "building" } })).not.toContain("resources");
});

test("timing edits send no drawings; insert, remove and reorder are explicit", () => {
  const first = sharePreview(compilation(), null);
  const next = sharePreview(compilation(2, [element("e1", ["A"], 3), element("e2", ["A"])], {}), first);
  const delta = patch(state(2), first, next);
  expect(delta.resources).toEqual({});
  expect(delta.elements.remove).toEqual(["e0"]);
  expect(delta.elements.order).toEqual(["e1", "e2"]);
  expect(delta.elements.upsert.map((e) => e.key)).toEqual(["e1", "e2"]);
  expect(() => sharePreview(compilation(3, [element("e0", ["missing"])], {}), next)).toThrow("missing drawing");
});

test("uses snapshots on initial connection and when a patch is larger", () => {
  const a = sharePreview(compilation(1, []), null);
  const b = sharePreview(compilation(2, []), a);
  expect(previewEvent(state(), null, a)).toStartWith("event: snapshot\n");
  expect(previewEvent(state(2), a, b)).toStartWith("event: snapshot\n");
});
