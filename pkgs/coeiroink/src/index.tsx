import type { JSX } from "@mekuru/core";
import { httpClient, limit } from "@mekuru/speech/engine";
import { line, voiceOf, type SpeechProps } from "@mekuru/speech";

const DEFAULT_URL = "http://127.0.0.1:50032";

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

const CONCURRENCY = 1;

interface Style {
  speaker: string;
  uuid: string;
  style: string;
  id: number;
}

class Engine {
  private readonly limited = limit(CONCURRENCY);
  private styles?: Promise<Style[]>;

  private readonly call: ReturnType<typeof httpClient>;

  constructor(url: string) {
    this.call = httpClient(
      url,
      "COEIROINK",
      "  - start COEIROINK v2 (its engine listens on port 50032 once the app has started)\n" +
        '  - if the engine is elsewhere, set `url="http://<host>:50032"` on `<Coeiroink>` or the MEKURU_COEIROINK_URL environment variable\n' +
        "  - from WSL2, with COEIROINK on Windows: turn on mirrored networking (`networkingMode=mirrored` in .wslconfig)",
    );
  }

  private async list(again = false): Promise<Style[]> {
    if (again) this.styles = undefined;
    this.styles ??= this.call("/v1/speakers").then(async (res) => {
      const speakers = (await res.json()) as { speakerName: string; speakerUuid: string; styles: { styleName: string; styleId: number }[] }[];
      return speakers.flatMap((s) => s.styles.map((st) => ({ speaker: s.speakerName, uuid: s.speakerUuid, style: st.styleName, id: st.styleId })));
    });
    return this.styles.catch((e: unknown) => {
      this.styles = undefined;
      throw e;
    });
  }

  private async style(speaker: number | string): Promise<Style> {
    const [name, style] = String(speaker)
      .split("/")
      .map((s) => s.trim());
    const id = style === undefined && /^\d+$/.test(name) ? Number(name) : undefined;
    const pick = (styles: Style[]) =>
      styles.find((s) => (id !== undefined ? s.id === id : (s.speaker === name || s.uuid === name) && (style === undefined || s.style === style)));
    const found = pick(await this.list()) ?? pick(await this.list(true));
    if (found) return found;
    const known = (await this.list()).map((s) => `${s.speaker}/${s.style}`).join(", ");
    throw new Error(
      `COEIROINK has no speaker \`${speaker}\` (it has ${known || "none"}).\n` +
        "  More characters and styles are downloaded in COEIROINK (キャラクターダウンロード), which is then restarted.",
    );
  }

  async synthesize(props: CoeiroinkProps, text: string, out: string): Promise<void> {
    return this.limited(async () => {
      const { uuid, id } = await this.style(props.speaker);
      const wav = await this.call("/v1/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerUuid: uuid,
          styleId: id,
          text,
          prosodyDetail: [],
          speedScale: props.speed ?? 1,
          pitchScale: props.pitch ?? 0,
          intonationScale: props.intonation ?? 1,
          volumeScale: props.volume ?? 1,
          prePhonemeLength: props.pre ?? 0.1,
          postPhonemeLength: props.post ?? 0.1,
          pauseLength: props.pause,
          outputSamplingRate: 48000,
        }),
      });
      await Bun.write(out, Buffer.from(await wav.arrayBuffer()));
    });
  }
}

const engines = new Map<string, Engine>();

const engine = (url: string | undefined): Engine => {
  const at = (url ?? process.env.MEKURU_COEIROINK_URL ?? DEFAULT_URL).replace(/\/+$/, "");
  const found = engines.get(at);
  if (found) return found;
  const created = new Engine(at);
  engines.set(at, created);
  return created;
};

export const Coeiroink = async (props: CoeiroinkProps): Promise<Awaited<JSX.Element>> => {
  const { url, ...voice } = voiceOf(props);
  return line("coeiroink", props, String(props.speaker), voice, (say, out) => engine(url).synthesize(props, say, out));
};

export * from "./characters.ts";
