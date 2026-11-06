import { wavSeconds } from "@mekuru/audio/wav";

export interface VoicevoxOptions {
  speaker: number | string;
  speed?: number;
  pitch?: number;
  intonation?: number;
  volume?: number;
  pre?: number;
  post?: number;
  "pause-scale"?: number;
}

export const requestFor = (props: VoicevoxOptions & { url?: string }, text: string) => ({
  url: new URL(props.url ?? process.env.MEKURU_VOICEVOX_URL ?? "http://127.0.0.1:50021").href.replace(/\/+$/, ""),
  speaker: props.speaker,
  text,
  overrides: {
    speedScale: props.speed,
    pitchScale: props.pitch,
    intonationScale: props.intonation,
    volumeScale: props.volume,
    prePhonemeLength: props.pre,
    postPhonemeLength: props.post,
    pauseLengthScale: props["pause-scale"],
  },
});

export const synthesize = async ({ url, speaker, text, overrides }: ReturnType<typeof requestFor>, out: string): Promise<void> => {
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(url + path, { ...init, signal: AbortSignal.timeout(300_000) }).catch((error: unknown) => {
      throw new Error(
        `VOICEVOX request failed at ${url}: ${error instanceof Error ? error.message : String(error)}.\n` +
          "Start VOICEVOX with `bun run voicevox` (Docker) or its app, or set MEKURU_VOICEVOX_URL / Voicevox's url.",
      );
    });
    if (!response.ok) throw new Error(`VOICEVOX ${path.split("?")[0]}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    return response;
  };
  let id: number;
  if (typeof speaker === "number" || /^\s*\d+\s*$/.test(speaker)) id = Number(speaker);
  else {
    const [name, style] = speaker.split("/").map((s) => s.trim());
    const speakers = (await (await call("/speakers")).json()) as { name: string; styles: { name: string; id: number }[] }[];
    const found = speakers.find((s) => s.name === name)?.styles.find((s) => style === undefined || s.name === style);
    if (!found) throw new Error(`VOICEVOX has no speaker \`${speaker}\` (see ${url}/speakers)`);
    id = found.id;
  }
  if (!Number.isSafeInteger(id) || id < 0) throw new Error("VOICEVOX speaker must be a non-negative integer or a speaker/style name");
  const query = (await (await call(`/audio_query?speaker=${id}&text=${encodeURIComponent(text)}`, { method: "POST" })).json()) as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      if (!Number.isFinite(value)) throw new Error(`VOICEVOX ${key} must be finite`);
      query[key] = value;
    }
  }
  query.outputSamplingRate = 48000;
  query.outputStereo = false;
  const response = await call(`/synthesis?speaker=${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  const wav = Buffer.from(await response.arrayBuffer());
  if (wavSeconds(wav, "VOICEVOX response") <= 0) throw new Error("VOICEVOX returned an empty WAV");
  await Bun.write(out, wav);
};
