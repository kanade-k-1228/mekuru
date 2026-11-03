import type { SpeechProps } from "@mekuru/speech";
export interface VoicevoxProps extends SpeechProps {
  speaker: number | string;
  speed?: number;
  pitch?: number;
  intonation?: number;
  volume?: number;
  pre?: number;
  post?: number;
  "pause-scale"?: number;
  url?: string;
}
