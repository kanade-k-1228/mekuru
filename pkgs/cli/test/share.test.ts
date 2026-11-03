import { expect, test } from "bun:test";
import { acceptPreview, serializeEvent, snapshot } from "../src/share.ts";
import { compilation, element, resources, state } from "./fixtures/preview.ts";
import { sharePreview, workerResponse } from "./fixtures/sharing.ts";

test("accepts worker patches, preserves unchanged resources and reconstructs reconnect snapshots", () => {
  const a = compilation();
  const first = acceptPreview(null, workerResponse(a, null));
  if (!first) throw new Error("missing preview");
  const b = compilation(2, [element("e0", ["A", "C"]), element("e1", ["A"], 1)], { C: resources.C });
  const response = workerResponse(b, first);
  expect(response.update?.type).toBe("patch");
  const second = acceptPreview(first, response);
  expect(second).toEqual(sharePreview(b, first));
  expect(second?.resources.A).toBe(first.resources.A);
  expect(second?.preview.elements[1]).toBe(first.preview.elements[1]);
  expect(Object.keys(snapshot(state(2), second).resources).sort()).toEqual(["A", "C"]);
  expect(serializeEvent({ type: "status", state: state(2) })).not.toContain("resources");
  const same = workerResponse(compilation(3, b.preview?.elements, { C: resources.C }), second);
  expect(same.update).toBeNull();
  expect(same.previewVersion).toBe(2);
  expect(acceptPreview(second, same)).toBe(second);
  expect(acceptPreview(second, { ...same, previewVersion: null })).toBe(second);
});

test("timing, insertion, removal and reorder patches match the full scene", () => {
  const a = compilation();
  const first = acceptPreview(null, workerResponse(a, null));
  const b = compilation(2, [element("e1", ["A"], 3), element("e2", ["A"])], {});
  const response = workerResponse(b, first);
  expect(response.update?.resources).toEqual({});
  expect(acceptPreview(first, response)).toEqual(sharePreview(b, first));
});

test("rejects invalid patches transactionally and accepts a fresh snapshot after restart", () => {
  const first = acceptPreview(null, workerResponse(compilation(), null));
  const b = compilation(2, [element("e0", ["A", "C"]), element("e1", ["A"], 1)], { C: resources.C });
  const response = workerResponse(b, first);
  if (response.update?.type !== "patch") throw new Error("expected patch");
  const delta = response.update;
  expect(() => acceptPreview(first, { ...response, update: { ...delta, resources: {} } })).toThrow("missing drawing");
  expect(() => acceptPreview(first, { ...response, update: { ...delta, baseVersion: 99 } })).toThrow("version mismatch");
  expect(() => acceptPreview(first, { ...response, update: { ...delta, elements: { ...delta.elements, order: ["missing"] } } })).toThrow("order");
  expect(first?.preview.version).toBe(1);
  expect(Object.keys(first?.resources ?? {}).sort()).toEqual(["A", "B"]);
  expect(acceptPreview(first, workerResponse({ ...b, resources }, null))).toEqual(sharePreview(b, first));
  expect(() => acceptPreview(first, { ...response, update: null })).toThrow("missing compiler preview update");
});
