import { atom } from "jotai";
import { observeSize } from "../observe";
import { timeAtom } from "../playback/atoms";
import { durationAtom } from "../server";
import { followAtom, timelineMetricsAtom, timelineViewAtom, timelineWidthAtom } from "./atoms";
import { timeAt, zoomAround, zoomAt } from "./model";

export const seekTimelineAtom = atom(null, (get, set, x: number) => set(timeAtom, timeAt(get(timelineMetricsAtom), x)));

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
