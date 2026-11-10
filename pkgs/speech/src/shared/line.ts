import { fps, frameCount, frames, isDraft, readAudio, waitFor, type At, type AudioSource, type Node, type Time } from "@mekuru/tsx";
import { cacheFile, synthesized } from "./cache.ts";
import { speechText } from "./text.tsx";

/** Text and video timing only. Each synthesis API defines its own voice settings. */
export interface LineProps {
  text: Node;
  name?: string;
  reading?: Readonly<Record<string, string>>;
  gap?: number;
  "gain-db"?: number;
  id?: string;
  at?: At;
  len?: Time;
}

export interface PreparedLine {
  readonly audio: AudioSource;
  readonly display: string;
}

type LineText = Awaited<ReturnType<typeof speechText>>;
export const lineText = async (props: LineProps): Promise<LineText> => {
  if ((props as { children?: unknown }).children !== undefined) throw new Error("a line goes in `text`, not in children");
  const text = await speechText(props.text, props.reading);
  if (!text.say) throw new Error("there is nothing to say (the text is empty)");
  return text;
};

/** Internal WAV-to-timeline bridge: no HTTP, engine selection or synthesis settings. */
export const prepareLine = async (
  props: LineProps,
  text: LineText,
  who: string,
  cacheKey: object,
  writeWav: (out: string) => Promise<void>,
): Promise<PreparedLine> => {
  const db = props["gain-db"];
  const volume = db === undefined ? undefined : Math.round(10 ** (db / 20) * 1000) / 1000;
  const label = `${props.name ?? who}: ${text.show}`;
  const gap = frameCount("gap", props.gap ?? Math.round(0.3 * fps()));
  if (props.len !== undefined) frameCount("len", props.len);
  const make = () => synthesized(cacheKey, text.say, writeWav);
  let audio: AudioSource;
  if (isDraft() && !(await Bun.file(cacheFile(cacheKey)).exists())) {
    waitFor(make());
    audio = Object.freeze({ status: "draft", len: props.len ?? frames([...text.say].length * 0.15) + gap, volume, label });
  } else audio = await readAudio(await make(), { len: props.len, gap, volume, label });
  return Object.freeze({ audio, display: text.display });
};
