import { defineSpeech, prepare, voiceOf } from "@mekuru/speech";
import { engine } from "./client.ts";
import type { VoicevoxProps } from "./props.ts";
export type { VoicevoxProps } from "./props.ts";
const prepareLine = async (props: Omit<VoicevoxProps, "id" | "at">) => {
  const { url, ...voice } = voiceOf(props);
  return prepare("voicevox", props, String(props.speaker), voice, (say, out) => engine(url).synthesize(voice, say, out));
};

export const Voicevox = defineSpeech<VoicevoxProps>(prepareLine);

export * from "./characters.ts";
