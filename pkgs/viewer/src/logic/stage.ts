import { atom } from "jotai";
import type { SceneElement } from "@mekuru/cli/protocol";
import { observeSize } from "./observe";
import { playingAtom, timeAtom } from "./playback/atoms";
import { envelope, frames, intervalIndex, mediaAt, shownAt, span } from "./playback/time";
import { scheduleAtom } from "./server";
import { clamp } from "./math";

const boxAtom = atom<{ width: number; height: number } | null>(null);
export const stageScaleAtom = atom((get) => {
  const box = get(boxAtom);
  const schedule = get(scheduleAtom);
  return box && schedule ? Math.min(box.width / schedule.width, box.height / schedule.height) : 0.25;
});
export const attachStageBoxAtom = atom(null, (_get, set, el: HTMLElement | null) => (el ? observeSize(el, (size) => set(boxAtom, size)) : undefined));

export interface Shown {
  element: SceneElement;
  opacity: number;
  media?: { position: number; play: boolean; rate: number; volume: number };
}

const indexAtom = atom((get) => intervalIndex((get(scheduleAtom)?.elements ?? []).map((element, order) => ({ ...span(element), order, element }))));

export const stageAtom = atom((get): Shown[] => {
  const schedule = get(scheduleAtom);
  if (!schedule) return [];
  const time = get(timeAtom);
  const t = Math.min(time, Math.max(0, schedule.duration - 1e-3));
  const playing = get(playingAtom) && time < schedule.duration;
  return get(indexAtom)(t)
    .filter(({ element }) => shownAt(element, t))
    .sort((a, b) => a.order - b.order)
    .map(({ element }) => {
      const times = frames(element, t) ?? [t];
      const fade = envelope(element.fades, times);
      const opacity = clamp(element.opacity * fade, 0, 1);
      if (!element.media) return { element, opacity };
      const { position, rate } = mediaAt(element.media.map, times[times.length - 1]);
      return { element, opacity, media: { position, play: playing && rate > 0, rate, volume: clamp(element.media.gain * fade, 0, 1) } };
    });
});
