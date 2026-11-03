import { defineSpeech, prepare, voiceOf } from "@mekuru/speech";
import { server } from "./client.ts";
import type { VoisonaProps } from "./props.ts";
export type { VoisonaProps } from "./props.ts";
const prepareLine = async (props: Omit<VoisonaProps, "id" | "at">) => {
  const { url, ...voice } = voiceOf(props);
  return prepare("voisona", props, props.voice, voice, (say, out) => server(url).synthesize(voice, say, out));
};

export const Voisona = defineSpeech<VoisonaProps>(prepareLine);

export * from "./characters.ts";
