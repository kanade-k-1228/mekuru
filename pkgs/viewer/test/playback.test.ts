import { expect, test } from "bun:test";
import { createStore } from "jotai";
import { playingAtom, stepAtom, timeAtom } from "../src/logic/playback/atoms";
import { scheduleAtom, serverAtom } from "../src/logic/server";
import { followAtom, timelineMetricsAtom, timelineViewAtom } from "../src/logic/timeline/atoms";

test("seeking and stepping update playback independently of timeline following", async () => {
  const Original = globalThis.EventSource;
  const originalFetch = globalThis.fetch;
  class Events {
    onopen = null;
    onerror = null;
    addEventListener(name: string, listener: (event: { data: string }) => void) {
      if (name !== "snapshot") return;
      listener({
        data: JSON.stringify({
          type: "snapshot",
          preview: { version: 1, width: 16, height: 16, fps: 30, duration: 100, elements: [], timeline: { nodes: [], clips: [] } },
          resources: {},
          state: {
            path: "video.xml",
            version: 1,
            previewVersion: 1,
            status: "ready",
            error: null,
            diagnostics: [],
          },
        }),
      });
    }
    close() {}
  }
  globalThis.EventSource = Events as unknown as typeof EventSource;
  globalThis.fetch = (async () =>
    Response.json({ version: 1, width: 16, height: 16, fps: 30, duration: 100, elements: [], timeline: { nodes: [], clips: [] } })) as unknown as typeof fetch;
  const store = createStore();
  const disconnect = store.sub(serverAtom, () => {});
  const unfollow = store.sub(timeAtom, () => store.set(followAtom, store.get(timeAtom)));
  try {
    for (let i = 0; store.get(scheduleAtom) === null; i++) {
      if (i > 100) throw new Error("the preview did not load");
      await Bun.sleep(1);
    }
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
    globalThis.fetch = originalFetch;
  }
});
