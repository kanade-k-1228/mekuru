import { atom, type Store } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { timeAtom } from "../playback";
import { clipsAtom, durationAtom, nodesAtom } from "../server";
import { clamp, observeSize } from "../util";
import { buildLayout, RULER_H, SCROLLBAR_SIZE, viewport, zoomAround, zoomAt, type ViewState } from "./model";

export const timelineViewAtom = atom<ViewState>({ zoom: 1, start: 0 });
const timelineWidthAtom = atom(800);
export const timelineMetricsAtom = atom((get) => viewport(get(durationAtom), get(timelineWidthAtom), get(timelineViewAtom)));

export const timelineLayoutAtom = atom((get) => buildLayout({ nodes: get(nodesAtom), clips: get(clipsAtom) }));

const followAtom = atom(null, (get, set, time: number) => {
  const view = get(timelineViewAtom);
  if (view.zoom <= 1) return;
  const m = get(timelineMetricsAtom);
  if (time < m.start || time > m.start + m.visibleSec) set(timelineViewAtom, { ...view, start: time - m.visibleSec * 0.1 });
});
/** Scrolls a zoomed timeline to keep the playhead visible; returns the unsubscribe function. */
export const followPlayhead = (store: Store) => store.sub(timeAtom, () => store.set(followAtom, store.get(timeAtom)));

export const zoomTimelineAtom = atom(null, (get, set, zoom: number) => {
  set(timelineViewAtom, (v) => zoomAround(v, zoom, get(durationAtom), get(timeAtom)));
  set(followAtom, get(timeAtom));
});

const wheelAtom = atom(null, (get, set, e: WheelEvent, x: number) => {
  const m = get(timelineMetricsAtom);
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    set(timelineViewAtom, (v) => zoomAt(m, v.zoom * Math.exp(-e.deltaY * 0.0025), x));
    set(followAtom, get(timeAtom));
    return;
  }
  if (m.visibleSec >= m.duration - 1e-6) return;
  const delta = e.shiftKey ? e.deltaY || e.deltaX : Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!delta) return;
  e.preventDefault();
  set(timelineViewAtom, (v) => ({ ...v, start: m.start + delta / m.pxPerSec }));
});

export const attachTimelineAtom = atom(null, (_get, set, el: HTMLElement | null) => {
  if (!el) return;
  const unobserve = observeSize(el, ({ width }) => {
    if (width > 0) set(timelineWidthAtom, Math.floor(width));
  });
  const onWheel = (e: WheelEvent) => set(wheelAtom, e, e.clientX - el.getBoundingClientRect().left);
  el.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    unobserve();
    el.removeEventListener("wheel", onWheel);
  };
});

export const PREVIEW_MIN_HEIGHT = 64;
export const TIMELINE_MIN_HEIGHT = 1 + RULER_H + SCROLLBAR_SIZE;
const TIMELINE_KEPT_HEIGHT = PREVIEW_MIN_HEIGHT + 40;
const TIMELINE_HEIGHT = 360;
const storedHeightAtom = atomWithStorage("mekuru.timelineHeight", TIMELINE_HEIGHT, undefined, { getOnInit: true });
export const timelineHeightAtom = atom(
  (get) => Math.max(get(storedHeightAtom), TIMELINE_MIN_HEIGHT),
  (_get, set, h: number) => {
    const max = Math.max(TIMELINE_MIN_HEIGHT, window.innerHeight - TIMELINE_KEPT_HEIGHT);
    set(storedHeightAtom, Math.round(clamp(h, TIMELINE_MIN_HEIGHT, max)));
  },
);
