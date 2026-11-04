import { expect, test } from "bun:test";
import { createStore } from "jotai";
import { compilation, Events, install, sharePreview, snapshot, state } from "./fixtures.ts";
import { playingAtom, stepAtom, timeAtom } from "../src/logic/playback";
import { serverAtom } from "../src/logic/server";
import { followPlayhead, timelineMetricsAtom, timelineViewAtom } from "../src/logic/timeline/atoms";

test("seeking and stepping update playback independently of timeline following", () => {
  const restore = install();
  const store = createStore();
  const disconnect = store.sub(serverAtom, () => {});
  const unfollow = followPlayhead(store);
  try {
    const result = compilation(1, []);
    result.preview.duration = 100;
    Events.all[0].receive(snapshot(state(), sharePreview(result, null)));
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
    restore();
  }
});
