import { expect, test } from "bun:test";
import { createStore } from "jotai";
import type { PreviewEvent } from "@mekuru/protocol";
import { compilation, state } from "../../cli/test/fixtures/preview.ts";
import { patch, sharePreview, snapshot } from "../../cli/src/share.ts";
import { connectEvents, initialConnection } from "../src/logic/events";
import { elementsAtom, serverAtom, timelineAtom } from "../src/logic/server";
import { timeAtom, playingAtom } from "../src/logic/playback/atoms";
import { timelineLayoutAtom, timelineViewAtom } from "../src/logic/timeline/atoms";

class Events {
  static all: Events[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (e: { data: string }) => void>();
  closed = false;
  constructor() {
    Events.all.push(this);
  }
  addEventListener(type: string, fn: (e: { data: string }) => void) {
    this.listeners.set(type, fn);
  }
  send(event: PreviewEvent) {
    this.listeners.get(event.type)?.({ data: JSON.stringify(event) });
  }
  close() {
    this.closed = true;
  }
}
const install = () => {
  const previous = globalThis.EventSource;
  Events.all = [];
  globalThis.EventSource = Events as unknown as typeof EventSource;
  return () => {
    globalThis.EventSource = previous;
  };
};

test("version mismatch reconnects for a snapshot and preserves the last good preview", async () => {
  const restore = install();
  let connection = initialConnection;
  const close = connectEvents((update) => {
    connection = update(connection);
  });
  try {
    const a = sharePreview(compilation(), null);
    Events.all[0].send(snapshot(state(), a));
    const preview = connection.preview;
    const b = sharePreview(compilation(2), a);
    Events.all[0].send({ ...patch(state(2), a, b), baseVersion: 999 });
    expect(Events.all[0].closed).toBe(true);
    expect(connection.preview).toBe(preview);
    expect(connection.conn).toBe("reconnecting");
    await Bun.sleep(1100);
    expect(Events.all).toHaveLength(2);
    Events.all[1].send(snapshot(state(2), b));
    expect(connection.previewVersion).toBe(2);
    expect(connection.previewError).toBeNull();
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
    Events.all[0].send(snapshot(state(), a));
    const elements = store.get(elementsAtom);
    const timeline = store.get(timelineAtom);
    const layout = store.get(timelineLayoutAtom);
    store.set(timeAtom, 1.8);
    store.set(playingAtom, true);
    store.set(timelineViewAtom, { zoom: 4, start: 0.3 });
    Events.all[0].send({ type: "status", state: { ...state(2), status: "error", error: "invalid XML" } });
    expect(store.get(elementsAtom)).toBe(elements);
    expect(store.get(timelineAtom)).toBe(timeline);
    expect(store.get(timelineLayoutAtom)).toBe(layout);
    expect(store.get(timeAtom)).toBe(1.8);
    expect(store.get(playingAtom)).toBe(true);
    const result = compilation(2);
    if (!result.preview) throw new Error("fixture preview");
    result.preview.duration = 1;
    const b = sharePreview(result, a);
    Events.all[0].send(patch(state(2), a, b));
    expect(store.get(timeAtom)).toBe(1);
    expect(store.get(playingAtom)).toBe(true);
    expect(store.get(timelineViewAtom)).toEqual({ zoom: 4, start: 0.3 });
    const c = sharePreview(compilation(3), b);
    Events.all[0].send(patch(state(3), b, c));
    expect(store.get(timeAtom)).toBe(1); // Does not jump back when duration grows.
  } finally {
    dispose();
    restore();
    globalThis.requestAnimationFrame = oldRaf;
  }
});
