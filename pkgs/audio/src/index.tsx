/** @jsxImportSource @mekuru/types */
import { relative, resolve, sep } from "node:path";
import { fps, projectRoot, type At, type Time } from "@mekuru/types";
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

export const Audio = ({ source, id, at }: { source: AudioSource; id?: string; at?: At }) => (
  <dur id={id} at={at} len={source.len}>
    <audio
      src={source.status === "ready" ? relative(projectRoot(), source.src).split(sep).join("/") : undefined}
      draft={source.status === "draft"}
      volume={source.volume}
      label={source.label}
    />
  </dur>
);
