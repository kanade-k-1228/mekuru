import { defineEngine, type EngineProps } from "@mekuru/speech";
import { client } from "./client.ts";

export interface StyleBertVits2Props extends EngineProps {
  model: string;
  speaker?: number | string;
  style?: string;
  "style-weight"?: number;
  "sdp-ratio"?: number;
  noise?: number;
  "noise-w"?: number;
  length?: number;
  language?: "JP" | "EN" | "ZH";
  "assist-text"?: string;
  "assist-text-weight"?: number;
}

export const StyleBertVits2 = defineEngine<StyleBertVits2Props>({
  kind: "style-bert-vits2",
  name: "Style-Bert-VITS2",
  defaultUrl: "http://127.0.0.1:5000",
  help:
    "  - start its API server in the Style-Bert-VITS2 folder: `python server_fastapi.py` (Server.bat on Windows);\n" +
    "    it listens on port 5000 (`server.port` in its config.yml)\n" +
    '  - if the server is elsewhere (WSL2 without mirrored networking), set `url="http://<windows-ip>:5000"` on `<StyleBertVits2>`\n' +
    "    or the MEKURU_STYLE_BERT_VITS2_URL environment variable",
  concurrency: 1,
  maxChars: 100,
  who: (props) => String(props.speaker ?? props.model),
  create: client,
});

export * from "./characters.ts";
