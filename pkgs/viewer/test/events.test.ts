import { expect, test } from "bun:test";
import { createStore } from "jotai";
import { compilation, Events, install, patch, sharePreview, snapshot, state } from "./fixtures.ts";
import { previewSocketUrl } from "../src/logic/preview";
import { connAtom, elementsAtom, previewErrorAtom, previewAtom, serverAtom, timelineAtom } from "../src/logic/server";
import { timeAtom, playingAtom } from "../src/logic/playback";
import { timelineLayoutAtom, timelineViewAtom } from "../src/logic/timeline/atoms";

test("version mismatch requests a snapshot over WebSocket; reconnect and cleanup preserve the last good preview", async () => {
  const restore = install();
  const store = createStore();
  const close = store.sub(serverAtom, () => {});
  try {
    const a = sharePreview(compilation(), null);
    Events.all[0].receive(snapshot(state(), a));
    const preview = store.get(previewAtom);
    const b = sharePreview(compilation(2), a);
    Events.all[0].receive({ ...patch(state(2), a, b), baseVersion: 999 });
    expect(Events.all[0].closed).toBe(false);
    expect(Events.all[0].sent).toEqual([JSON.stringify({ type: "resync" })]);
    expect(store.get(previewAtom)).toBe(preview);
    expect(store.get(connAtom)).toBe("reconnecting");
    Events.all[0].receive(patch(state(2), a, b)); // Ignore queued patches until the fresh snapshot.
    expect(store.get(previewAtom)).toBe(preview);
    Events.all[0].receive(snapshot(state(2), b));
    expect(store.get(previewAtom)?.version).toBe(2);
    expect(store.get(previewErrorAtom)).toBeNull();
    Events.all[0].onclose?.();
    expect(store.get(connAtom)).toBe("reconnecting");
    Events.all[0].receive(snapshot(state(), a)); // Closed sockets cannot roll state back.
    expect(store.get(previewAtom)?.version).toBe(2);
    await Bun.sleep(1100);
    expect(Events.all).toHaveLength(2);
    Events.all[1].receive(snapshot(state(2), b));
    expect(store.get(previewAtom)?.version).toBe(2);
    expect(store.get(previewErrorAtom)).toBeNull();
    Events.all[1].onerror?.();
    close();
    await Bun.sleep(1100);
    expect(Events.all).toHaveLength(2);
  } finally {
    close();
    restore();
  }
});

test("status keeps scene subscriptions and playback; duration shrink clamps the stored time", () => {
  const restore = install();
  const oldRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  const store = createStore();
  const dispose = store.sub(serverAtom, () => {});
  try {
    const a = sharePreview(compilation(), null);
    Events.all[0].receive(snapshot(state(), a));
    const elements = store.get(elementsAtom);
    const timeline = store.get(timelineAtom);
    const layout = store.get(timelineLayoutAtom);
    store.set(timeAtom, 1.8);
    store.set(playingAtom, true);
    store.set(timelineViewAtom, { zoom: 4, start: 0.3 });
    Events.all[0].receive({ type: "status", state: { ...state(2), status: "error", error: "invalid XML" } });
    expect(store.get(elementsAtom)).toBe(elements);
    expect(store.get(timelineAtom)).toBe(timeline);
    expect(store.get(timelineLayoutAtom)).toBe(layout);
    expect(store.get(timeAtom)).toBe(1.8);
    expect(store.get(playingAtom)).toBe(true);
    const result = compilation(2);
    result.preview.duration = 1;
    const b = sharePreview(result, a);
    Events.all[0].receive(patch(state(2), a, b));
    expect(store.get(timeAtom)).toBe(1);
    expect(store.get(playingAtom)).toBe(true);
    expect(store.get(timelineViewAtom)).toEqual({ zoom: 4, start: 0.3 });
    const c = sharePreview(compilation(3), b);
    Events.all[0].receive(patch(state(3), b, c));
    expect(store.get(timeAtom)).toBe(1); // Does not jump back when duration grows.
  } finally {
    dispose();
    restore();
    globalThis.requestAnimationFrame = oldRaf;
  }
});

test("WebSocket URLs follow the page's host and TLS", () => {
  expect(previewSocketUrl("http://localhost:5173/editor")).toBe("ws://localhost:5173/api/ws");
  expect(previewSocketUrl("https://preview.example/editor")).toBe("wss://preview.example/api/ws");
});

test("malformed messages request one resync and a missing snapshot causes reconnect", async () => {
  const restore = install();
  const store = createStore();
  const close = store.sub(serverAtom, () => {});
  try {
    Events.all[0].receive(snapshot(state(), sharePreview(compilation(), null)));
    const before = store.get(previewAtom);
    Events.all[0].onmessage?.({ data: "invalid JSON" });
    Events.all[0].onmessage?.({ data: "invalid JSON again" });
    expect(Events.all[0].sent).toHaveLength(1);
    expect(store.get(previewAtom)).toBe(before);
    await Bun.sleep(3100);
    expect(Events.all[0].closed).toBe(true);
    expect(store.get(previewErrorAtom)).toContain("timed out");
  } finally {
    close();
    restore();
  }
});
