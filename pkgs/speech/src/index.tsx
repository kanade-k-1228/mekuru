/** @jsxImportSource @mekuru/core */
import { cacheFile, synthesized } from "./cache.ts";
import { Audio, readAudio, type AudioSource } from "@mekuru/audio";
import { fps, isDraft, waitFor, type At, type JSX, type Node, type Time } from "@mekuru/core";
import { speechText } from "./text.tsx";

export { subtitleText } from "./text.tsx";

export interface SpeechProps {
  children?: Node;
  name?: string;
  reading?: Readonly<Record<string, string>>;
  gap?: number;
  "gain-db"?: number;
  id?: string;
  at?: At;
  len?: Time;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

const frames = (seconds: number) => Math.ceil(seconds * fps() - 1e-6);

const SECONDS_PER_CHAR = 0.15;
const GAP_SECONDS = 0.3;

const frameCount = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative whole number of frames`);
  return value;
};

/** Separate engine options from text and timeline properties. */
export const voiceOf = <P extends SpeechProps>(props: P): Omit<P, keyof SpeechProps> => {
  const { children, name, reading, gap, "gain-db": db, id, at, len, ...voice } = props;
  return voice;
};

export const prepare = async (
  kind: string,
  props: SpeechProps,
  who: string,
  voice: object,
  synthesize: (say: string, out: string) => Promise<void>,
): Promise<PreparedLine> => {
  const { say, show, display } = await speechText(props.children, props.reading);
  if (!say) throw new Error("there is nothing to say (the text is empty)");
  const db = props["gain-db"];
  const volume = db === undefined ? undefined : round(10 ** (db / 20));
  const label = `${props.name ?? who}: ${show}`;
  const gap = frameCount("gap", props.gap ?? Math.round(GAP_SECONDS * fps()));
  if (props.len !== undefined) frameCount("len", props.len);
  const make = () => synthesized(kind, voice, say, (out) => synthesize(say, out));
  if (isDraft() && !(await Bun.file(cacheFile(kind, voice, say)).exists())) {
    waitFor(make());
    const audio: AudioSource = Object.freeze({ status: "draft", len: props.len ?? frames([...say].length * SECONDS_PER_CHAR) + gap, volume, label });
    return prepared(audio, display);
  }
  const file = await make();
  const audio = await readAudio(file, { len: props.len, gap, volume, label });
  return prepared(audio, display);
};

export interface PreparedLine {
  readonly audio: AudioSource;
  readonly len: number;
  readonly display: Node;
}

const prepared = (audio: AudioSource, display: Node): PreparedLine =>
  Object.freeze({
    audio,
    get len() {
      return audio.len;
    },
    display,
  });

/** The JSX convenience API uses exactly the same resource as custom narrators. */
export const line = async (...args: Parameters<typeof prepare>): Promise<JSX.Element> => {
  const result = await prepare(...args);
  return <Audio source={result.audio} id={args[1].id} at={args[1].at} />;
};

export { defineSpeech } from "./component.tsx";
