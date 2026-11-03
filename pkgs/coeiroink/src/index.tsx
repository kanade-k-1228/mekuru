import { defineSpeech, prepare, voiceOf } from "@mekuru/speech";
import { engine } from "./client.ts";
import type { CoeiroinkProps } from "./props.ts";
export type { CoeiroinkProps } from "./props.ts";
const prepareLine = async (props: Omit<CoeiroinkProps, "id" | "at">) => {
  const { url, ...voice } = voiceOf(props);
  return prepare("coeiroink", props, String(props.speaker), voice, (say, out) => engine(url).synthesize(voice, say, out));
};

export const Coeiroink = defineSpeech<CoeiroinkProps>(prepareLine);

export * from "./characters.ts";
