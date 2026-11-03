import type { SpeechProps } from "@mekuru/speech";
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
