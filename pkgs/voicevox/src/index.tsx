import { defineEngine, type EngineProps } from "@mekuru/speech";
import { client } from "./client.ts";

export interface VoicevoxProps extends EngineProps {
  speaker: number | string;
  speed?: number;
  pitch?: number;
  intonation?: number;
  volume?: number;
  pre?: number;
  post?: number;
  "pause-scale"?: number;
}

export const Voicevox = defineEngine<VoicevoxProps>({
  kind: "voicevox",
  name: "VOICEVOX",
  env: "MEKURU_VOICEVOX_URL",
  defaultUrl: "http://127.0.0.1:50021",
  help:
    "  - start the VOICEVOX app (its engine listens on port 50021), or\n" +
    "    docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest\n" +
    '  - if the engine is elsewhere (WSL2 without mirrored networking), set `url="http://<windows-ip>:50021"` on `<Voicevox>`\n' +
    "    or the MEKURU_VOICEVOX_URL environment variable",
  concurrency: 2,
  who: (props) => String(props.speaker),
  create: client,
});

export * from "./characters.ts";
