import { joined, type Shot } from "./shots.ts";
const HALF = 0.04;
const CLOSED = 0.08;
const AGAIN = 0.12;

export interface Blinking {
  open: string;
  frames: readonly string[];
  every: number;
  fps: number;
  rand: () => number;
}

export const blinks = ({ open, frames, every, fps, rand }: Blinking, len?: number, count = 6): Shot[] => {
  const shots: Shot[] = [];
  let t = 0;
  let left = count;
  const end = len ?? Infinity;
  const show = (src: string, d: number) => {
    const n = Math.min(Math.round(d), end - t);
    if (n > 0) shots.push({ src, len: n });
    t += Math.max(0, n);
  };
  const quick = (seconds: number) => Math.max(1, Math.round(seconds * fps));
  const blink = () => {
    for (let i = frames.length - 1; i >= 1; i--) show(frames[i], quick(HALF));
    show(frames[0], quick(CLOSED));
    for (let i = 1; i < frames.length; i++) show(frames[i], quick(HALF));
  };
  const gap = () => every * (0.5 + rand());
  show(open, len === undefined ? gap() : gap() * rand());
  while (t < end && (len !== undefined || left-- > 0)) {
    blink();
    if (rand() < 0.15) {
      show(open, quick(AGAIN));
      blink();
    }
    show(open, gap());
  }
  return joined(shots);
};
