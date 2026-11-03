import type { FrameInterval, FrameRate } from "@mekuru/protocol";
export type { FrameRate } from "@mekuru/protocol";
export interface CaptionCue {
  text: string;
  offset: number;
  frames: number;
}
export type CaptionOptions = { weights?: readonly number[]; boundaries?: never } | { boundaries: readonly number[]; weights?: never };
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Partition a duration into contiguous, nonempty integer frame intervals. */
export function captionCues(texts: readonly string[], frames: number, options: CaptionOptions = {}): CaptionCue[] {
  const n = texts.length;
  if (!integer(frames) || frames < n || texts.some((t) => !t.trim()) || (!n && frames !== 0)) throw new Error("captions need text and at least one frame each");
  let bounds: readonly number[];
  if (options.boundaries) {
    bounds = options.boundaries;
    if (
      options.weights ||
      bounds.length !== n + 1 ||
      bounds[0] !== 0 ||
      bounds[n] !== frames ||
      bounds.some((b, i) => !integer(b) || (i > 0 && b <= bounds[i - 1]))
    )
      throw new Error("invalid caption boundaries");
  } else {
    const weights = options.weights ?? texts.map((text) => [...text.replace(/\s/gu, "")].length);
    const total = weights.reduce((a, b) => a + b, 0);
    if (weights.length !== n || weights.some((w) => !Number.isFinite(w) || w < 0) || !Number.isFinite(total) || (n > 0 && total <= 0))
      throw new Error("invalid caption weights");
    let used = 0;
    bounds = [
      0,
      ...weights.map((w, i) => {
        used += w;
        return i === n - 1 ? frames : i + 1 + Math.floor((frames - n) * (used / total));
      }),
    ];
  }
  return texts.map((text, i) => ({ text, offset: bounds[i], frames: bounds[i + 1] - bounds[i] }));
}

export interface SrtCue extends FrameInterval {
  text: string;
}
/** Serialize compiler-resolved absolute frames. Does not infer timing. */
export function toSrt(cues: readonly SrtCue[], fps: FrameRate): string {
  if (!integer(fps.num) || !integer(fps.den) || !fps.num || !fps.den) throw new Error("invalid frame rate");
  const ms = (frame: number) => Math.round((frame * 1000 * fps.den) / fps.num);
  const stamp = (t: number) =>
    `${String(Math.floor(t / 3600000)).padStart(2, "0")}:${String(Math.floor(t / 60000) % 60).padStart(2, "0")}:${String(Math.floor(t / 1000) % 60).padStart(2, "0")},${String(t % 1000).padStart(3, "0")}`;
  return [...cues]
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((cue, i) => {
      if (!cue.text.trim() || !integer(cue.startFrame) || !integer(cue.endFrame) || cue.endFrame <= cue.startFrame)
        throw new Error("invalid subtitle interval");
      const start = ms(cue.startFrame),
        end = ms(cue.endFrame);
      if (!Number.isSafeInteger(end) || end <= start) throw new Error("subtitle interval cannot be represented in milliseconds");
      return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${cue.text.replace(/\r\n?/g, "\n")}\n`;
    })
    .join("\n");
}
