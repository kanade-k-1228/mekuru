import { joinWavs } from "@mekuru/audio/wav";
import { defineSpeech, prepare, type SpeechProps } from "./index.tsx";

/** The props of every component made with `defineEngine()`. */
export interface EngineProps extends SpeechProps {
  /** Base URL of the server. */
  url?: string;
  /** Lines longer than this are split, read part by part and joined. */
  "max-chars"?: number;
}

/** A speech engine behind an HTTP server. */
export interface Engine<P extends EngineProps> {
  /** Engine name in the cache key and in `MEKURU_<KIND>_URL` (`-` becomes `_`), the environment variable with the server URL when `url` is not set. */
  kind: string;
  /** Engine name in error messages. */
  name: string;
  defaultUrl: string;
  /** How to start the server, shown when it is not reachable (before how to set `url`). */
  help: string;
  /** Lines synthesized at once by one server. */
  concurrency: number;
  /** Lines longer than `max-chars` (default `maxChars`) are split, read part by part and joined. */
  maxChars?: number;
  /** The speaker's name when `name` is not set. */
  who: (props: Omit<P, "id" | "at">) => string;
  /** Makes the reader for one server: `voice` is the props that are not text, timing or `url`, and also the cache key. */
  create: (
    call: (path: string, init?: RequestInit) => Promise<Response>,
    url: string,
  ) => (voice: Omit<P, keyof SpeechProps | "url">, text: string) => Promise<ArrayBuffer>;
}

const httpClient =
  (url: string, name: string, help: string) =>
  async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(url + path, { ...init, signal: AbortSignal.timeout(300_000) }).catch((e: unknown) => {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(`${name} is not reachable at ${url} (${reason}).\n${help}`);
    });
    if (!res.ok) throw new Error(`${name} ${path.split("?")[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res;
  };

/** Remembers what `load` returns. A failed load is forgotten so the next call tries again; `fresh` loads again anyway. */
export const cached = <T>(load: () => Promise<T>) => {
  let value: Promise<T> | undefined;
  return (fresh = false): Promise<T> => {
    if (fresh || !value) {
      const loading = load();
      value = loading;
      loading.catch(() => {
        if (value === loading) value = undefined;
      });
    }
    return value;
  };
};

const limit = (concurrency: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (running < concurrency) running++;
    else await new Promise<void>((go) => waiting.push(go));
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
};

const splitText = (text: string, max: number): string[] => {
  const size = Math.max(1, Math.floor(max));
  const out: string[] = [];
  let rest = [...text];
  while (rest.length > size) {
    const head = rest.slice(0, size);
    const cut = head.findLastIndex((c) => "。！？!?」』".includes(c)) + 1 || head.findLastIndex((c) => "、，, ".includes(c)) + 1 || size;
    out.push(rest.slice(0, cut).join("").trim());
    rest = rest.slice(cut);
  }
  out.push(rest.join("").trim());
  return out.filter((p) => p);
};

export const defineEngine = <P extends EngineProps>(engine: Engine<P>) => {
  const env = `MEKURU_${engine.kind.toUpperCase().replaceAll("-", "_")}_URL`;
  const help =
    `${engine.help}\n` +
    `  - if it runs elsewhere, set \`url="${engine.defaultUrl.replace(/\/\/[^/:]+/, "//<host>")}"\` on the component or the ${env} environment variable\n` +
    `  - from WSL2, with ${engine.name} on Windows: turn on mirrored networking (\`networkingMode=mirrored\` in .wslconfig)`;
  const servers = new Map<string, { read: ReturnType<Engine<P>["create"]>; queue: ReturnType<typeof limit> }>();
  const server = (url: string | undefined) => {
    const at = (url ?? process.env[env] ?? engine.defaultUrl).replace(/\/+$/, "");
    let found = servers.get(at);
    if (!found) {
      found = { read: engine.create(httpClient(at, engine.name, help), at), queue: limit(engine.concurrency) };
      servers.set(at, found);
    }
    return found;
  };
  return defineSpeech<P>((props) => {
    // The component passes `id` and `at` too.
    const { text, name, reading, gap, "gain-db": db, id, at, len, url, ...voice } = props as P;
    const max = (props as EngineProps)["max-chars"] ?? engine.maxChars;
    return prepare(engine.kind, props, engine.who(props), voice, (say, out) => {
      const { read, queue } = server(url);
      return queue(async () => {
        const wavs: Buffer[] = [];
        for (const part of max === undefined ? [say] : splitText(say, max)) wavs.push(Buffer.from(await read(voice, part)));
        await Bun.write(out, wavs.length === 1 ? wavs[0] : joinWavs(wavs));
      });
    });
  });
};
