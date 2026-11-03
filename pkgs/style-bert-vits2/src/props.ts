import type { SpeechProps } from "@mekuru/speech";
export interface StyleBertVits2Props extends SpeechProps {
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
  "max-chars"?: number;
  url?: string;
}
