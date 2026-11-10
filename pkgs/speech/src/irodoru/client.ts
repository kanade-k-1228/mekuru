import { joinWavs, wavSeconds } from "@mekuru/audio/wav";

/** Synthesis fields use the names of irodoru's POST / request (pkgs/server/openapi.json). */
export interface IrodoruOptions {
  reference_audio_base64?: string;
  caption?: string;
  seed?: number;
  num_steps?: number;
  cfg_scale_text?: number;
  cfg_scale_speaker?: number;
  cfg_scale_caption?: number;
  cfg_min_t?: number;
  cfg_max_t?: number;
  t_schedule?: "linear" | "sway";
  sway_coeff?: number;
  duration_scale?: number;
  seconds?: number;
  trim_tail?: boolean;
}

const splitText = (text: string, max: number): string[] => {
  const out: string[] = [];
  let rest = [...text];
  while (rest.length > max) {
    const head = rest.slice(0, max);
    const cut = head.findLastIndex((c) => "。！？!?」』".includes(c)) + 1 || head.findLastIndex((c) => "、，, ".includes(c)) + 1 || max;
    out.push(rest.slice(0, cut).join("").trim());
    rest = rest.slice(cut);
  }
  out.push(rest.join("").trim());
  return out.filter(Boolean);
};

export const requestFor = (props: IrodoruOptions & { url?: string; "max-chars"?: number }, text: string) => {
  const url = new URL(props.url ?? process.env.MEKURU_IRODORU_URL ?? "http://127.0.0.1:8080");
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error("irodoru url must be an HTTP(S) base URL without credentials, query or fragment");
  }
  const maxChars = props["max-chars"] ?? 100;
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 1000) throw new Error("max-chars must be an integer from 1 to 1000");
  // Pick known fields explicitly: timeline props must never reach irodoru or the cache key.
  const options = {
    reference_audio_base64: props.reference_audio_base64,
    caption: props.caption,
    seed: props.seed ?? 1,
    num_steps: props.num_steps,
    cfg_scale_text: props.cfg_scale_text ?? 3,
    cfg_scale_speaker: props.cfg_scale_speaker ?? 5,
    cfg_scale_caption: props.cfg_scale_caption ?? 3,
    cfg_min_t: props.cfg_min_t ?? 0.5,
    cfg_max_t: props.cfg_max_t ?? 1,
    t_schedule: props.t_schedule ?? "linear",
    sway_coeff: (props.t_schedule ?? "linear") === "sway" ? (props.sway_coeff ?? -1) : undefined,
    duration_scale: props.duration_scale ?? 1,
    seconds: props.seconds,
    trim_tail: props.trim_tail ?? true,
  };
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${key} must be finite`);
  }
  if (!Number.isSafeInteger(options.seed) || options.seed < 0) throw new Error("seed must be a non-negative safe integer");
  if (options.num_steps !== undefined && (!Number.isInteger(options.num_steps) || options.num_steps < 1 || options.num_steps > 200)) {
    throw new Error("num_steps must be an integer from 1 to 200");
  }
  if (options.duration_scale <= 0 || options.duration_scale > 5) throw new Error("duration_scale must be in (0, 5]");
  if (options.seconds !== undefined && (options.seconds < 0.5 || options.seconds > 30)) throw new Error("seconds must be in [0.5, 30]");
  const parts = splitText(text, maxChars);
  if (options.seconds !== undefined && parts.length > 1) throw new Error("seconds cannot be combined with a line split by max-chars; shorten the line");
  return { url: url.href.replace(/\/+$/, ""), maxChars, options, parts };
};

// Keep only active queues. A failed request releases its successor too.
const queues = new Map<string, Promise<void>>();
export const synthesize = async (request: ReturnType<typeof requestFor>, out: string): Promise<void> => {
  const { url, options, parts } = request;
  const previous = queues.get(url) ?? Promise.resolve();
  const turn = Promise.withResolvers<void>();
  queues.set(url, turn.promise);
  await previous;
  try {
    const wavs: Buffer[] = [];
    for (const text of parts) {
      const response = await fetch(`${url}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...options, text }),
        signal: AbortSignal.timeout(300_000),
      }).catch((error: unknown) => {
        throw new Error(
          `irodoru request failed at ${url}: ${error instanceof Error ? error.message : String(error)}.\n` +
            "Start irodoru with `bun run irodoru` (Docker), wait for the server to start, or set MEKURU_IRODORU_URL / Speech's url.",
        );
      });
      if (!response.ok) throw new Error(`irodoru /: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
      const wav = Buffer.from(await response.arrayBuffer());
      const seconds = wavSeconds(wav, "irodoru response");
      if (seconds <= 0) throw new Error("irodoru returned an empty WAV");
      if (options.seconds === undefined && seconds >= 29.9) {
        console.warn("irodoru audio reached its 30-second limit and may be incomplete; shorten the line or reduce max-chars.");
      }
      wavs.push(wav);
    }
    await Bun.write(out, wavs.length === 1 ? wavs[0] : joinWavs(wavs));
  } finally {
    turn.resolve();
    if (queues.get(url) === turn.promise) queues.delete(url);
  }
};
