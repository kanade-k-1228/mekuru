/** @jsxImportSource @mekuru/tsx */
import { cacheFile, synthesized } from "./cache.ts";
import { Audio, frameCount, frames, readAudio, type AudioSource } from "@mekuru/audio";
import { fps, isDraft, waitFor, type At, type JSX, type Node, type Time } from "@mekuru/tsx";
import { speechText } from "./text.tsx";

export interface SpeechProps {
  text: Node;
  name?: string;
  reading?: Readonly<Record<string, string>>;
  gap?: number;
  "gain-db"?: number;
  id?: string;
  at?: At;
  len?: Time;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

const SECONDS_PER_CHAR = 0.15;
const GAP_SECONDS = 0.3;

export interface PreparedLine {
  readonly audio: AudioSource;
  readonly display: string;
}

export const prepare = async (
  kind: string,
  props: SpeechProps,
  who: string,
  voice: object,
  synthesize: (say: string, out: string) => Promise<void>,
): Promise<PreparedLine> => {
  if ((props as { children?: unknown }).children !== undefined) throw new Error('a line goes in `text` (`<Voicevox text="…" />`), not in children');
  const { say, show, display } = await speechText(props.text, props.reading);
  if (!say) throw new Error("there is nothing to say (the text is empty)");
  const db = props["gain-db"];
  const volume = db === undefined ? undefined : round(10 ** (db / 20));
  const label = `${props.name ?? who}: ${show}`;
  const gap = frameCount("gap", props.gap ?? Math.round(GAP_SECONDS * fps()));
  if (props.len !== undefined) frameCount("len", props.len);
  const make = () => synthesized(kind, voice, say, (out) => synthesize(say, out));
  let audio: AudioSource;
  if (isDraft() && !(await Bun.file(cacheFile(kind, voice, say)).exists())) {
    waitFor(make());
    audio = Object.freeze({ status: "draft", len: props.len ?? frames([...say].length * SECONDS_PER_CHAR) + gap, volume, label });
  } else audio = await readAudio(await make(), { len: props.len, gap, volume, label });
  return Object.freeze({ audio, display });
};

export const defineSpeech = <P extends SpeechProps>(prepare: (props: Omit<P, "id" | "at">) => Promise<PreparedLine>) =>
  Object.assign(
    async (props: P): Promise<Awaited<JSX.Element>> => {
      const line = await prepare(props);
      return <Audio source={line.audio} id={props.id} at={props.at} />;
    },
    { prepare },
  );
