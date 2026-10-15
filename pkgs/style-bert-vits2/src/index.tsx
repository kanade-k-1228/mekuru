import type { JSX } from "@mekuru/core";
import { httpClient, limit } from "@mekuru/speech/engine";
import { joinWavs, line, voiceOf, type SpeechProps } from "@mekuru/speech";

const DEFAULT_URL = "http://127.0.0.1:5000";

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

const parts = (text: string, max: number): string[] => {
  const limit = Math.max(1, Math.floor(max));
  const out: string[] = [];
  let rest = [...text];
  while (rest.length > limit) {
    const head = rest.slice(0, limit);
    const cut = head.findLastIndex((c) => "。！？!?」』".includes(c)) + 1 || head.findLastIndex((c) => "、，, ".includes(c)) + 1 || limit;
    out.push(rest.slice(0, cut).join("").trim());
    rest = rest.slice(cut);
  }
  out.push(rest.join("").trim());
  return out.filter((p) => p);
};

interface ModelInfo {
  model_path: string;
  spk2id: Record<string, number>;
  style2id: Record<string, number>;
}

class Server {
  private readonly limited = limit(1);

  private readonly call: ReturnType<typeof httpClient>;

  constructor(url: string) {
    this.call = httpClient(
      url,
      "Style-Bert-VITS2",
      "  - start its API server in the Style-Bert-VITS2 folder: `python server_fastapi.py` (Server.bat on Windows);\n" +
        "    it listens on port 5000 (`server.port` in its config.yml)\n" +
        '  - if the server is elsewhere (WSL2 without mirrored networking), set `url="http://<windows-ip>:5000"` on `<StyleBertVits2>`\n' +
        "    or the MEKURU_STYLE_BERT_VITS2_URL environment variable",
    );
  }

  private async check(props: StyleBertVits2Props): Promise<void> {
    const models = Object.values((await (await this.call("/models/info")).json()) as Record<string, ModelInfo>);
    const name = (m: ModelInfo) => m.model_path.split(/[\\/]/).at(-2);
    const model = models.find((m) => name(m) === props.model);
    if (!model) throw new Error(`Style-Bert-VITS2 has no model \`${props.model}\` (it has ${models.map(name).join(", ")})`);
    const { speaker, style } = props;
    if (speaker !== undefined && !(typeof speaker === "number" ? Object.values(model.spk2id).includes(speaker) : Object.hasOwn(model.spk2id, speaker))) {
      throw new Error(`the Style-Bert-VITS2 model \`${props.model}\` has no speaker \`${speaker}\` (it has ${Object.keys(model.spk2id).join(", ")})`);
    }
    if (style !== undefined && !Object.hasOwn(model.style2id, style)) {
      throw new Error(`the Style-Bert-VITS2 model \`${props.model}\` has no style \`${style}\` (it has ${Object.keys(model.style2id).join(", ")})`);
    }
  }

  private async write(props: StyleBertVits2Props, text: string, out: string): Promise<void> {
    await this.check(props);
    const wavs: Buffer[] = [];
    for (const part of parts(text, props["max-chars"] ?? 100)) {
      const query = new URLSearchParams({ text: part, model_name: props.model, language: props.language ?? "JP" });
      const set = (key: string, value: number | string | undefined) => {
        if (value !== undefined) query.set(key, String(value));
      };
      set(typeof props.speaker === "number" ? "speaker_id" : "speaker_name", props.speaker);
      set("style", props.style);
      set("style_weight", props["style-weight"]);
      set("sdp_ratio", props["sdp-ratio"]);
      set("noise", props.noise);
      set("noisew", props["noise-w"]);
      set("length", props.length);
      set("assist_text", props["assist-text"]);
      set("assist_text_weight", props["assist-text-weight"]);
      wavs.push(Buffer.from(await (await this.call(`/voice?${query}`, { method: "POST" })).arrayBuffer()));
    }
    await Bun.write(out, wavs.length === 1 ? wavs[0] : joinWavs(wavs));
  }

  synthesize(props: StyleBertVits2Props, text: string, out: string): Promise<void> {
    return this.limited(() => this.write(props, text, out));
  }
}

const servers = new Map<string, Server>();

const server = (url: string | undefined): Server => {
  const at = (url ?? process.env.MEKURU_STYLE_BERT_VITS2_URL ?? DEFAULT_URL).replace(/\/+$/, "");
  const found = servers.get(at);
  if (found) return found;
  const created = new Server(at);
  servers.set(at, created);
  return created;
};

export const StyleBertVits2 = async (props: StyleBertVits2Props): Promise<Awaited<JSX.Element>> => {
  const { url, ...voice } = voiceOf(props);
  return line("style-bert-vits2", props, String(props.speaker ?? props.model), voice, (say, out) => server(url).synthesize(props, say, out));
};
