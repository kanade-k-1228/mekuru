import { readFile, rm, writeFile } from "node:fs/promises";
import { windowsEngine } from "@mekuru/speech/engine";
import type { JSX } from "@mekuru/core";
import { joinWavs, line, voiceOf, type SpeechProps } from "@mekuru/speech";

export interface CevioProps extends SpeechProps {
  cast: string;
  volume?: number;
  speed?: number;
  tone?: number;
  alpha?: number;
  "tone-scale"?: number;
  emotion?: Readonly<Record<string, number>>;
  "dll-dir"?: string;
  "max-chars"?: number;
  "stage-dir"?: string;
}

const splitText = (text: string, max: number): string[] => {
  const limit = Math.max(1, Math.floor(max));
  const len = (s: string) => [...s].length;
  if (len(text) <= limit) return [text];
  const sentences: string[] = [];
  let cur = "";
  for (const c of text) {
    cur += c;
    if ("。！？!?\n".includes(c)) {
      sentences.push(cur);
      cur = "";
    }
  }
  if (cur) sentences.push(cur);
  const out: string[] = [];
  let buf = "";
  for (const sentence of sentences) {
    let pieces = [sentence];
    if (len(sentence) > limit) {
      pieces = [];
      let piece = "";
      for (const c of sentence) {
        piece += c;
        if (("、，,".includes(c) && len(piece) >= Math.floor(limit / 2)) || len(piece) >= limit) {
          pieces.push(piece);
          piece = "";
        }
      }
      if (piece) pieces.push(piece);
    }
    for (const piece of pieces) {
      if (len(buf) + len(piece) > limit && buf) {
        out.push(buf);
        buf = "";
      }
      buf += piece;
    }
  }
  if (buf) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
};

const jobEntry = (id: number, text: string, out: string, voice: CevioProps): Record<string, unknown> => {
  const unit = (x: number | undefined) => (x === undefined ? null : Math.min(100, Math.max(0, Math.round(x))));
  return {
    id,
    text,
    out,
    cast: voice.cast,
    Volume: unit(voice.volume),
    Speed: unit(voice.speed),
    Tone: unit(voice.tone),
    Alpha: unit(voice.alpha),
    ToneScale: unit(voice["tone-scale"]),
    components: Object.fromEntries(Object.entries(voice.emotion ?? {}).map(([name, value]) => [name, unit(value)])),
  };
};

const installation = windowsEngine<CevioProps>({
  id: "cevio",
  name: "CeVIO",
  product: "CeVIO AI",
  component: "Cevio",
  script: new URL("./cevio.ps1", import.meta.url),
  timeout: (count) => 60_000 + 20_000 * count,
  jobEntry,
});

export const Cevio = async (props: CevioProps): Promise<Awaited<JSX.Element>> => {
  const { "dll-dir": dllDir, "stage-dir": stageDir, ...voice } = voiceOf(props);
  return line("cevio", props, props.cast, voice, async (say, out) => {
    const cevio = installation(dllDir, stageDir);
    const texts = splitText(say, props["max-chars"] ?? 150);
    if (texts.length === 1) return cevio.say(props, say, out);
    const parts = texts.map((_, i) => `${out}.${i}`);
    try {
      await Promise.all(texts.map((text, i) => cevio.say(props, text, parts[i])));
      await writeFile(out, joinWavs(await Promise.all(parts.map((part) => readFile(part)))));
    } finally {
      await Promise.all(parts.map((part) => rm(part, { force: true })));
    }
  });
};
