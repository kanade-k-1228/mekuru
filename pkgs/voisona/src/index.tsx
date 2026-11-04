import { defineEngine, type EngineProps } from "@mekuru/speech";
import { client } from "./client.ts";

export interface VoisonaProps extends EngineProps {
  voice: string;
  version?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  alp?: number;
  huskiness?: number;
  intonation?: number;
  style?: Readonly<Record<string, number>>;
}

export const Voisona = defineEngine<VoisonaProps>({
  kind: "voisona",
  name: "VoiSona Talk",
  defaultUrl: "http://localhost:32766",
  help: "  - start VoiSona Talk (1.3.7 or later; it listens on port 32766), sign in, and turn on 「REST APIを有効にする」 in the API tab of its preferences",
  concurrency: 1,
  maxChars: 500,
  who: (props) => props.voice,
  create: client,
});

export * from "./characters.ts";
