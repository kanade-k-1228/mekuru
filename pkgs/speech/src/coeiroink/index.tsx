import { defineEngine, type EngineProps } from "../engine.ts";
import { client } from "./client.ts";

export interface CoeiroinkProps extends EngineProps {
  speaker: number | string;
  speed?: number;
  pitch?: number;
  intonation?: number;
  volume?: number;
  pre?: number;
  post?: number;
  pause?: number;
}

export const Coeiroink = defineEngine<CoeiroinkProps>({
  kind: "coeiroink",
  name: "COEIROINK",
  defaultUrl: "http://127.0.0.1:50032",
  help: "  - start COEIROINK v2 (its engine listens on port 50032 once the app has started)",
  concurrency: 1,
  who: (props) => String(props.speaker),
  create: client,
});

export * from "./characters.ts";
