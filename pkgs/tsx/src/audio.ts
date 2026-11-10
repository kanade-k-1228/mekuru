import { relative, resolve, sep } from "node:path";
import { projectRoot } from "./context.ts";
import { fps } from "./expand.ts";
import type { At, Time } from "./jsx.ts";
import { jsx } from "./runtime.ts";
import { wavSeconds } from "./wav.ts";
/** A finite audio resource in the current video's frames, including trailing silence. */
export type AudioSource = Readonly<{
  len: number;
  label?: string;
  volume?: number;
}> &
  (Readonly<{ status: "draft" }> | Readonly<{ status: "ready"; src: string }>);

export const frames = (seconds: number) => Math.ceil(seconds * fps() - 1e-6);

export const frameCount = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative whole number of frames`);
  return value;
};

export const readAudio = async (src: string, options: { len?: Time; gap?: Time; label?: string; volume?: number } = {}): Promise<AudioSource> => {
  const file = resolve(projectRoot(), src);
  const gap = frameCount("gap", options.gap ?? 0);
  const len = options.len ?? frames(wavSeconds(Buffer.from(await Bun.file(file).arrayBuffer()), file)) + gap;
  return Object.freeze({ status: "ready", src: file, len: frameCount("len", len), label: options.label, volume: options.volume });
};

/** An audio resource on the timeline: `<dur len><audio/></dur>`. */
export const Audio = ({ source, id, at }: { source: AudioSource; id?: string; at?: At }) => {
  const src = source.status === "ready" ? relative(projectRoot(), source.src).split(sep).join("/") : undefined;
  const audio = jsx("audio", { src, draft: source.status === "draft", volume: source.volume, label: source.label });
  return jsx("dur", { id, at, len: source.len, children: audio });
};
