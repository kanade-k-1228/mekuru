import type { SpeechProps } from "@mekuru/speech";
export interface VoisonaProps extends SpeechProps {
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
  "max-chars"?: number;
  url?: string;
}
