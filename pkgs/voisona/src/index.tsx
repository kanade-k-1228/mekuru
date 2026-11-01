import type { JSX } from "@mekuru/core";
import { httpClient, limit, splitText } from "@mekuru/speech/engine";
import { joinWavs, line, voiceOf, type SpeechProps } from "@mekuru/speech";

const DEFAULT_URL = "http://localhost:32766";
const API = "/api/talk/v1";
const TIMEOUT = 300_000;

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

interface Voice {
  voice_name: string;
  voice_version: string;
  languages: string[];
  display_names?: { language: string; name: string }[];
}

interface VoiceDetail {
  style_names?: string[];
  default_style_weights?: number[];
}

interface Synthesis {
  state: "queued" | "running" | "succeeded" | "failed";
}

const HELP =
  "  - start VoiSona Talk (1.3.7 or later), sign in, and turn on 「REST APIを有効にする」 in the API tab of its preferences\n" +
  "  - it listens on port 32766; if it is elsewhere (WSL2 without mirrored networking), set `url` on `<Voisona>`\n" +
  "    or the MEKURU_VOISONA_URL environment variable";

const CREDENTIALS =
  "VoiSona Talk needs the email you sign in with and the API password (set in the API tab of its preferences):\n" +
  "  set the MEKURU_VOISONA_USER and MEKURU_VOISONA_PASSWORD environment variables";

const names = (v: Voice): string[] => [v.voice_name, ...(v.display_names ?? []).map((d) => d.name)];

const newer = (a: string, b: string): number => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] ?? 0) - (x[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

class Server {
  private readonly limited = limit(1);

  private readonly raw: ReturnType<typeof httpClient>;

  private voices?: Promise<Voice[]>;

  private readonly details = new Map<string, Promise<VoiceDetail>>();

  constructor(url: string) {
    this.raw = httpClient(url, "VoiSona Talk", HELP);
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const user = process.env.MEKURU_VOISONA_USER;
    const password = process.env.MEKURU_VOISONA_PASSWORD;
    if (!user || !password) throw new Error(CREDENTIALS);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`);
    try {
      return await this.raw(API + path, { ...init, headers });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw /: HTTP 401\b/.test(message) ? new Error(`${message}\n${CREDENTIALS}`) : e;
    }
  }

  private async voice(props: VoisonaProps): Promise<{ voice: Voice; language: string }> {
    this.voices ??= this.call("/voices")
      .then(async (res) => ((await res.json()) as { items: Voice[] }).items)
      .catch((e: unknown) => {
        this.voices = undefined;
        throw e;
      });
    const all = await this.voices;
    const found = all.filter((v) => names(v).includes(props.voice)).sort((a, b) => newer(a.voice_version, b.voice_version));
    if (found.length === 0) {
      const have = [...new Set(all.map((v) => `${v.voice_name} (${names(v).slice(1).join(", ")})`))];
      throw new Error(`VoiSona Talk has no voice \`${props.voice}\` (it has ${have.join(", ") || "none"}; download voices in the app)`);
    }
    if (new Set(found.map((v) => v.voice_name)).size > 1) {
      throw new Error(`VoiSona Talk has several voices named \`${props.voice}\`: write one of ${[...new Set(found.map((v) => v.voice_name))].join(", ")}`);
    }
    const voice = props.version === undefined ? found[0] : found.find((v) => v.voice_version === props.version);
    if (!voice) throw new Error(`VoiSona Talk has no version ${props.version} of \`${props.voice}\` (it has ${found.map((v) => v.voice_version).join(", ")})`);
    const language = props.language ?? voice.languages[0];
    if (!voice.languages.includes(language)) {
      throw new Error(`the VoiSona Talk voice \`${props.voice}\` does not speak ${language} (it speaks ${voice.languages.join(", ")})`);
    }
    return { voice, language };
  }

  private async styleWeights(voice: Voice, style: Readonly<Record<string, number>>): Promise<number[]> {
    const key = `${voice.voice_name}/${voice.voice_version}`;
    let detail = this.details.get(key);
    if (!detail) {
      detail = this.call(`/voices/${encodeURIComponent(voice.voice_name)}/${encodeURIComponent(voice.voice_version)}`).then(
        async (res) => (await res.json()) as VoiceDetail,
      );
      detail.catch(() => this.details.delete(key));
      this.details.set(key, detail);
    }
    const { style_names: styles = [], default_style_weights: defaults = [] } = await detail;
    const weights = styles.map((_, i) => defaults[i] ?? 0);
    for (const [name, weight] of Object.entries(style)) {
      const i = styles.indexOf(name);
      if (i < 0) throw new Error(`the VoiSona Talk voice \`${voice.voice_name}\` has no style \`${name}\` (it has ${styles.join(", ") || "none"})`);
      weights[i] = weight;
    }
    return weights;
  }

  private async speak(body: object, text: string): Promise<Buffer> {
    const res = await this.call("/speech-syntheses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, text }),
    });
    const { uuid } = (await res.json()) as { uuid: string };
    try {
      const until = Date.now() + TIMEOUT;
      for (;;) {
        const { state } = (await (await this.call(`/speech-syntheses/${uuid}`)).json()) as Synthesis;
        if (state === "succeeded") break;
        if (state === "failed") throw new Error(`VoiSona Talk could not read: ${text.slice(0, 40)}`);
        if (Date.now() > until) throw new Error(`VoiSona Talk did not finish in ${TIMEOUT / 1000}s: ${text.slice(0, 40)}`);
        await Bun.sleep(100);
      }
      return Buffer.from(await (await this.call(`/speech-syntheses/${uuid}/wav`)).arrayBuffer());
    } finally {
      await this.call(`/speech-syntheses/${uuid}`, { method: "DELETE" }).catch(() => {});
    }
  }

  private async write(props: VoisonaProps, text: string, out: string): Promise<void> {
    const { voice, language } = await this.voice(props);
    const global: Record<string, number | number[]> = {};
    for (const key of ["speed", "pitch", "volume", "alp", "huskiness", "intonation"] as const) {
      const value = props[key];
      if (value !== undefined) global[key] = value;
    }
    if (props.style) global.style_weights = await this.styleWeights(voice, props.style);
    const body = {
      language,
      voice_name: voice.voice_name,
      voice_version: voice.voice_version,
      global_parameters: global,
      destination: "memory",
      force_enqueue: true,
    };
    const wavs: Buffer[] = [];
    for (const part of splitText(text, props["max-chars"] ?? 500)) wavs.push(await this.speak(body, part));
    await Bun.write(out, wavs.length === 1 ? wavs[0] : joinWavs(wavs));
  }

  synthesize(props: VoisonaProps, text: string, out: string): Promise<void> {
    return this.limited(() => this.write(props, text, out));
  }
}

const servers = new Map<string, Server>();

const server = (url: string | undefined): Server => {
  const at = (url ?? process.env.MEKURU_VOISONA_URL ?? DEFAULT_URL).replace(/\/+$/, "");
  const found = servers.get(at);
  if (found) return found;
  const created = new Server(at);
  servers.set(at, created);
  return created;
};

export const Voisona = async (props: VoisonaProps): Promise<Awaited<JSX.Element>> => {
  const { url, ...voice } = voiceOf(props);
  return line("voisona", props, props.voice, voice, (say, out) => server(url).synthesize(props, say, out));
};

export * from "./characters.ts";
