import { defineSpeech, prepare, voiceOf } from "@mekuru/speech";
import { server } from "./client.ts";
import type { StyleBertVits2Props } from "./props.ts";
export type { StyleBertVits2Props } from "./props.ts";
const prepareLine = async (props: Omit<StyleBertVits2Props, "id" | "at">) => {
  const { url, ...voice } = voiceOf(props);
  return prepare("style-bert-vits2", props, String(props.speaker ?? props.model), voice, (say, out) => server(url).synthesize(voice, say, out));
};

export const StyleBertVits2 = defineSpeech<StyleBertVits2Props>(prepareLine);

export * from "./characters.ts";
