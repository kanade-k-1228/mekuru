import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { TimelineDto } from "@mekuru/cli/protocol";
import { durationAtom, scheduleAtom } from "../server";
import { clamp } from "../math";
import { buildLayout, RULER_H, SCROLLBAR_SIZE, viewport, type ViewState } from "./model";

export const timelineViewAtom = atom<ViewState>({ zoom: 1, start: 0 });
export const timelineWidthAtom = atom(800);
export const timelineMetricsAtom = atom((get) => viewport(get(durationAtom), get(timelineWidthAtom), get(timelineViewAtom)));

const EMPTY: TimelineDto = { nodes: [], clips: [] };
export const timelineLayoutAtom = atom((get) => buildLayout(get(scheduleAtom)?.timeline ?? EMPTY));
export const hasEstimatedAtom = atom((get) => get(scheduleAtom)?.timeline.clips.some((c) => c.estimated) ?? false);

export const followAtom = atom(null, (get, set, time: number) => {
  const view = get(timelineViewAtom);
  if (view.zoom <= 1) return;
  const m = get(timelineMetricsAtom);
  if (time < m.start || time > m.start + m.visibleSec) set(timelineViewAtom, { ...view, start: time - m.visibleSec * 0.1 });
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

const resizeFromAtom = atom<{ y: number; height: number } | null>(null);
export const resizingAtom = atom((get) => get(resizeFromAtom) != null);
export const startResizeAtom = atom(null, (_get, set, y: number, shownHeight: number) => set(resizeFromAtom, { y, height: shownHeight }));
export const resizeToAtom = atom(null, (get, set, y: number) => {
  const from = get(resizeFromAtom);
  if (from) set(timelineHeightAtom, from.height - (y - from.y));
});
export const endResizeAtom = atom(null, (_get, set) => set(resizeFromAtom, null));
