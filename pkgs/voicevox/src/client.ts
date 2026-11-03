import type { SpeechProps } from "@mekuru/speech";

import { httpClient, limit } from "@mekuru/speech/engine";

import type { VoicevoxProps } from "./props.ts";
type Voice = Omit<VoicevoxProps, keyof SpeechProps | "url">;

const DEFAULT_URL = "http://127.0.0.1:50021";

const CONCURRENCY = 2;

class Engine {
  private readonly limited = limit(CONCURRENCY);
  private styles?: Promise<{ speaker: string; style: string; id: number }[]>;

  private readonly call: ReturnType<typeof httpClient>;

  constructor(private readonly url: string) {
    this.call = httpClient(
      url,
      "VOICEVOX",
      "  - start the VOICEVOX app (its engine listens on port 50021), or\n" +
        "    docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest\n" +
        '  - if the engine is elsewhere (WSL2 without mirrored networking), set `url="http://<windows-ip>:50021"` on `<Voicevox>`\n' +
        "    or the MEKURU_VOICEVOX_URL environment variable",
    );
  }

  private async styleId(speaker: number | string): Promise<number> {
    if (typeof speaker === "number") return speaker;
    if (/^\s*\d+\s*$/.test(speaker)) return Number(speaker);
    this.styles ??= this.call("/speakers").then(async (res) => {
      const speakers = (await res.json()) as { name: string; styles: { name: string; id: number }[] }[];
      return speakers.flatMap((s) => s.styles.map((st) => ({ speaker: s.name, style: st.name, id: st.id })));
    });
    const [name, style] = speaker.split("/").map((s) => s.trim());
    const found = (await this.styles).find((s) => s.speaker === name && (style === undefined || s.style === style));
    if (!found) throw new Error(`VOICEVOX has no speaker \`${speaker}\` (see ${this.url}/speakers for the list)`);
    return found.id;
  }

  async synthesize(props: Voice, text: string, out: string): Promise<void> {
    return this.limited(async () => {
      const id = await this.styleId(props.speaker);
      const query = (await (await this.call(`/audio_query?speaker=${id}&text=${encodeURIComponent(text)}`, { method: "POST" })).json()) as Record<
        string,
        unknown
      >;
      const set = (key: string, value: number | undefined) => {
        if (value !== undefined) query[key] = value;
      };
      set("speedScale", props.speed);
      set("pitchScale", props.pitch);
      set("intonationScale", props.intonation);
      set("volumeScale", props.volume);
      set("prePhonemeLength", props.pre);
      set("postPhonemeLength", props.post);
      set("pauseLengthScale", props["pause-scale"]);
      query.outputSamplingRate = 48000;
      query.outputStereo = false;
      const wav = await this.call(`/synthesis?speaker=${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      await Bun.write(out, Buffer.from(await wav.arrayBuffer()));
    });
  }
}

const engines = new Map<string, Engine>();

export const engine = (url: string | undefined): Engine => {
  const at = (url ?? process.env.MEKURU_VOICEVOX_URL ?? DEFAULT_URL).replace(/\/+$/, "");
  const found = engines.get(at);
  if (found) return found;
  const created = new Engine(at);
  engines.set(at, created);
  return created;
};
