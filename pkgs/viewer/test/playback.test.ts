import { expect, test } from "bun:test";
import { createStore } from "jotai";
import { playingAtom, stepAtom, timeAtom } from "../src/logic/playback/atoms";
import { serverAtom } from "../src/logic/server";
import { followAtom, timelineMetricsAtom, timelineViewAtom } from "../src/logic/timeline/atoms";

test("seeking and stepping update playback independently of timeline following", () => {
  const Original = globalThis.EventSource;
  class Events {
    onopen = null;
    onerror = null;
    addEventListener(_name: string, listener: (event: { data: string }) => void) {
      listener({
        data: JSON.stringify({
          path: "video.xml",
          version: 1,
          previewVersion: 1,
          status: "ready",
          error: null,
          diagnostics: [],
          preview: { width: 16, height: 16, fps: 30, duration: 100, elements: [], timeline: { nodes: [], clips: [] } },
        }),
      });
    }
    close() {}
  }
  globalThis.EventSource = Events as unknown as typeof EventSource;
  const store = createStore();
  const disconnect = store.sub(serverAtom, () => {});
  const unfollow = store.sub(timeAtom, () => store.set(followAtom, store.get(timeAtom)));
  try {
    store.set(timelineViewAtom, { start: 0, zoom: 10 });
    store.set(timeAtom, 50);
    const metrics = store.get(timelineMetricsAtom);
    expect(metrics.start).toBeLessThan(50);
    expect(metrics.start + metrics.visibleSec).toBeGreaterThan(50);
    store.set(stepAtom, { frames: 1 });
    expect(store.get(timeAtom)).toBeCloseTo(50 + 1 / 30);
    expect(store.get(playingAtom)).toBe(false);
    store.set(timeAtom, 200);
    expect(store.get(timeAtom)).toBe(100);
    store.set(timeAtom, -5);
    expect(store.get(timeAtom)).toBe(0);
    unfollow();
    store.set(timelineViewAtom, { start: 0, zoom: 10 });
    store.set(timeAtom, 50);
    expect(store.get(timelineViewAtom).start).toBe(0);
  } finally {
    unfollow();
    disconnect();
    globalThis.EventSource = Original;
  }
});
