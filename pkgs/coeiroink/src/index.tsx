import { defineEngine, type SpeechProps } from "@mekuru/speech";
import { client } from "./client.ts";

export interface CoeiroinkProps extends SpeechProps {
  speaker: number | string;
  speed?: number;
  pitch?: number;
  intonation?: number;
  volume?: number;
  pre?: number;
  post?: number;
  pause?: number;
  url?: string;
}

export const Coeiroink = defineEngine<CoeiroinkProps>({
  kind: "coeiroink",
  name: "COEIROINK",
  env: "MEKURU_COEIROINK_URL",
  defaultUrl: "http://127.0.0.1:50032",
  help:
    "  - start COEIROINK v2 (its engine listens on port 50032 once the app has started)\n" +
    '  - if the engine is elsewhere, set `url="http://<host>:50032"` on `<Coeiroink>` or the MEKURU_COEIROINK_URL environment variable\n' +
    "  - from WSL2, with COEIROINK on Windows: turn on mirrored networking (`networkingMode=mirrored` in .wslconfig)",
  concurrency: 1,
  who: (props) => String(props.speaker),
  create: client,
});

export * from "./characters.ts";
