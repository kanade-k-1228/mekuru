import { windowsEngine } from "@mekuru/speech/engine";
import type { JSX } from "@mekuru/core";
import { line, voiceOf, type SpeechProps } from "@mekuru/speech";

export interface AivoiceProps extends SpeechProps {
  voice: string;
  volume?: number;
  speed?: number;
  pitch?: number;
  "pitch-range"?: number;
  "middle-pause"?: number;
  "long-pause"?: number;
  "sentence-pause"?: number;
  "dll-dir"?: string;
  "stage-dir"?: string;
}

const MASTER = [
  ["Volume", "volume", 1, 0, 5, 2],
  ["Pitch", "pitch", 1, 0.1, 5, 2],
  ["Speed", "speed", 1, 0.1, 5, 2],
  ["PitchRange", "pitch-range", 1, 0, 5, 2],
  ["MiddlePause", "middle-pause", 150, 80, 500, 0],
  ["LongPause", "long-pause", 370, 80, 2000, 0],
  ["SentencePause", "sentence-pause", 800, 0, 10000, 0],
] as const;

const jobEntry = (id: number, text: string, out: string, voice: AivoiceProps): Record<string, unknown> => {
  const master = MASTER.map(([key, prop, def, min, max, digits]) => [key, Number(Math.min(max, Math.max(min, voice[prop] ?? def)).toFixed(digits))]);
  return { id, text, out, voice: voice.voice, master: JSON.stringify(Object.fromEntries(master)) };
};

const SAVE_SETTINGS =
  "\n  (in the project settings of A.I.VOICE Editor, 音声ファイル保存: 1つのファイルに書き出す, WAVE with ファイルヘッダー有り," +
  " and ファイル保存ダイアログで選択する)";

const installation = windowsEngine<AivoiceProps>({
  id: "aivoice",
  name: "A.I.VOICE",
  product: "A.I.VOICE",
  component: "Aivoice",
  script: new URL("./aivoice.ps1", import.meta.url),
  timeout: (count) => 90_000 + 20_000 * count,
  jobEntry,
  validateWav: async (wav) => {
    if (!(await Bun.file(wav).exists()) || (await Bun.file(wav).slice(0, 4).text()) !== "RIFF") {
      throw new Error(`A.I.VOICE did not write the WAV file it was asked for${SAVE_SETTINGS}`);
    }
  },
});

export const Aivoice = async (props: AivoiceProps): Promise<Awaited<JSX.Element>> => {
  const { "dll-dir": dllDir, "stage-dir": stageDir, ...voice } = voiceOf(props);
  return line("aivoice", props, props.voice, voice, (say, out) => installation(dllDir, stageDir).say(props, say, out));
};
