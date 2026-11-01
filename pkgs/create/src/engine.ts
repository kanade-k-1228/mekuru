export const ENGINES = {
  voicevox: { name: "VOICEVOX", hint: "free: the app, or the engine in Docker", pkg: "@mekuru/voicevox" },
  aivisspeech: { name: "AivisSpeech", hint: "free: the app, or the engine in Docker", pkg: "@mekuru/voicevox" },
  sharevox: { name: "SHAREVOX", hint: "free: the app (no longer updated)", pkg: "@mekuru/voicevox" },
  voisona: { name: "VoiSona Talk", hint: "the app on Windows or macOS, with its REST API on; 田中傘 is free", pkg: "@mekuru/voisona" },
  coeiroink: { name: "COEIROINK", hint: "free: the app (v2)", pkg: "@mekuru/coeiroink" },
  "style-bert-vits2": { name: "Style-Bert-VITS2", hint: "free: its API server", pkg: "@mekuru/style-bert-vits2" },
} as const;
export type Engine = keyof typeof ENGINES;
export const ENGINE_NAMES = Object.keys(ENGINES) as Engine[];

export const isEngine = (name: string): name is Engine => (ENGINE_NAMES as string[]).includes(name);
