import { atom } from "jotai";
import { durationAtom, fpsAtom, previewAtom, seekTimeAtom } from "./server";
import { clamp } from "./util";

export const timeAtom = atom(
  (get) => get(seekTimeAtom),
  (get, set, t: number) => {
    set(seekTimeAtom, clamp(t, 0, get(durationAtom)));
  },
);

const playingBaseAtom = atom(false);
const loopAtom = atom(0);
export const playingAtom = atom(
  (get) => get(playingBaseAtom),
  (get, set, playing: boolean) => {
    if (playing === get(playingBaseAtom)) return;
    set(playingBaseAtom, playing);
    if (!playing) return;
    const loop = get(loopAtom) + 1;
    set(loopAtom, loop);
    let last = performance.now();
    const tick = (now: number) => {
      if (!get(playingBaseAtom) || get(loopAtom) !== loop) return;
      const duration = get(durationAtom);
      const t = Math.min(get(timeAtom) + (now - last) / 1000, duration);
      last = now;
      set(timeAtom, t);
      if (t >= duration) set(playingBaseAtom, false);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
);

export const togglePlayAtom = atom(null, (get, set) => {
  const playing = get(playingAtom);
  if (!playing && get(timeAtom) >= get(durationAtom) - 0.5 / get(fpsAtom)) set(timeAtom, 0);
  set(playingAtom, !playing);
});

export const stepAtom = atom(null, (get, set, step: { frames: number } | { seconds: number }) => {
  const fps = get(fpsAtom);
  const frames = "frames" in step ? step.frames : step.seconds * fps;
  set(playingAtom, false);
  set(timeAtom, Math.round(get(timeAtom) * fps + frames) / fps);
});

export const keysAtom = atom(null, (get, set, e: KeyboardEvent) => {
  if (get(previewAtom) == null || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest("button, input, textarea, select, [contenteditable]")) return;
  if (e.key === " ") {
    e.preventDefault();
    if (!e.repeat) set(togglePlayAtom);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const dir = e.key === "ArrowLeft" ? -1 : 1;
    set(stepAtom, e.shiftKey ? { seconds: dir } : { frames: dir });
  }
});
keysAtom.onMount = (onKey) => {
  const listener = (e: KeyboardEvent) => onKey(e);
  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
};
