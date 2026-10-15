/** @jsxImportSource @mekuru/core */
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fps, isDraft, waitFor, type At, type JSX, type Node, type Time } from "@mekuru/core";
import { Fragment } from "@mekuru/core/jsx-runtime";

interface SpeechProgress {
  done: number;
  total: number;
  label: string;
}

const showSpeech = (p: SpeechProgress): void => {
  const text = `speech ${p.done}/${p.total}  ${p.label.replace(/\s+/g, " ").slice(0, 40)}`;
  if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K${text}${p.done === p.total ? "\n" : ""}`);
  else console.log(text);
};

const root = process.cwd();

export interface SpeechProps {
  children?: Node;
  name?: string;
  reading?: Readonly<Record<string, string>>;
  gap?: number;
  "gain-db"?: number;
  id?: string;
  at?: At;
  len?: Time;
}

const BREAK = Symbol("br");
type Run = string | typeof BREAK;

const runs = (node: Node, out: Run[] = []): Run[] => {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (Array.isArray(node)) {
    for (const n of node) runs(n, out);
  } else if (typeof node === "object" && "tag" in node) {
    if (node.tag === Fragment) runs(node.children, out);
    else if (node.tag === "br") out.push(BREAK);
    else throw new Error(`a line of speech is text (and \`<br />\`), not ${typeof node.tag === "string" ? `<${node.tag}>` : "a component"}`);
  } else {
    const last = out[out.length - 1];
    if (typeof last === "string") out[out.length - 1] = last + String(node);
    else out.push(String(node));
  }
  return out;
};

const isKanji = (c: string) => /[一-鿿㐀-䶿豈-﫿々〆ヶ〇]/.test(c);

type Piece = string | { base: string; reading: string };

const rubies = (text: string): Piece[] => {
  const out: Piece[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  for (let i = 0; i < text.length; ) {
    const c = String.fromCodePoint(text.codePointAt(i) ?? 0);
    const rest = text.slice(i + c.length);
    if (c === "｜" || c === "|") {
      const open = rest.indexOf("《");
      const close = rest.indexOf("》", open);
      if (open > 0 && close >= 0 && !/[《》｜]/.test(rest.slice(0, open))) {
        flush();
        out.push({ base: rest.slice(0, open), reading: rest.slice(open + 1, close) });
        i += c.length + close + 1;
        continue;
      }
    }
    if (c === "《" && rest.includes("》")) {
      const chars = [...buf];
      let n = 0;
      while (n < chars.length && isKanji(chars[chars.length - 1 - n])) n++;
      if (n > 0) {
        const base = chars.slice(chars.length - n).join("");
        buf = chars.slice(0, chars.length - n).join("");
        flush();
        out.push({ base, reading: rest.slice(0, rest.indexOf("》")) });
        i += c.length + rest.indexOf("》") + 1;
        continue;
      }
    }
    buf += c;
    i += c.length;
  }
  flush();
  return out;
};

const withReadings = (text: string, words: [string, string][]): string => {
  if (words.length === 0) return text;
  let out = "";
  outer: for (let i = 0; i < text.length; ) {
    for (const [word, as] of words) {
      if (text.startsWith(word, i)) {
        out += as;
        i += word.length;
        continue outer;
      }
    }
    const c = String.fromCodePoint(text.codePointAt(i) ?? 0);
    out += c;
    i += c.length;
  }
  return out;
};

const speechText = (children: Node, reading: Readonly<Record<string, string>> = {}): { say: string; show: string } => {
  const words = Object.entries(reading)
    .filter(([word]) => word)
    .sort((a, b) => [...b[0]].length - [...a[0]].length);
  const line = runs(children);
  let say = "";
  let show = "";
  line.forEach((run, i) => {
    if (run === BREAK) {
      say += " ";
      show += " ";
      return;
    }
    let text = run;
    if (i === 0 || line[i - 1] === BREAK) text = text.trimStart();
    if (i === line.length - 1 || line[i + 1] === BREAK) text = text.trimEnd();
    for (const piece of rubies(text)) {
      say += typeof piece === "string" ? withReadings(piece, words) : piece.reading;
      show += typeof piece === "string" ? piece : piece.base;
    }
  });
  return { say: say.trim(), show: show.trim() };
};

const CACHE_VERSION = 1;

const canonical = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
};

const pending = new Map<string, Promise<string>>();
const progress = { done: 0, total: 0 };

const cacheFile = (kind: string, voice: object, text: string): string => {
  const key = new Bun.CryptoHasher("sha256").update(canonical({ v: CACHE_VERSION, kind, voice, text })).digest("hex");
  return join(root, ".mekuru", "cache", "tts", key.slice(0, 2), `${key}.wav`);
};

const synthesized = (kind: string, voice: object, text: string, synthesize: (out: string) => Promise<void>): Promise<string> => {
  const file = cacheFile(kind, voice, text);
  let made = pending.get(file);
  if (!made) {
    made = (async () => {
      if (await Bun.file(file).exists()) return file;
      if (progress.total++ === progress.done) setTimeout(() => progress.done < progress.total && showSpeech({ ...progress, label: text }), 30);
      const part = `${file}.${process.pid}.part`;
      try {
        await mkdir(dirname(file), { recursive: true });
        await synthesize(part);
        await rename(part, file);
        return file;
      } finally {
        await rm(part, { force: true });
        progress.done++;
        showSpeech({ ...progress, label: text });
      }
    })().finally(() => {
      pending.delete(file);
    });
    pending.set(file, made);
  }
  return made;
};

interface Wav {
  fmt: Buffer;
  data: Buffer;
}

const parseWav = (bytes: Buffer, what: string): Wav => {
  if (bytes.length < 12 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WAVE") {
    throw new Error(`${what} is not a WAV file`);
  }
  let fmt: Buffer | undefined;
  let data: Buffer | undefined;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = bytes.toString("latin1", at, at + 4);
    const size = Math.min(bytes.readUInt32LE(at + 4), bytes.length - at - 8);
    if (id === "fmt ") fmt = bytes.subarray(at + 8, at + 8 + size);
    if (id === "data") data = bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  if (!fmt || fmt.length < 16 || !data) throw new Error(`${what} is not a WAV file (no samples)`);
  return { fmt, data };
};

const wavSeconds = (bytes: Buffer, what = "the audio"): number => {
  const { fmt, data } = parseWav(bytes, what);
  const bytesPerSecond = fmt.readUInt32LE(8);
  if (bytesPerSecond === 0) throw new Error(`${what} is not a WAV file (no sample rate)`);
  return data.length / bytesPerSecond;
};

export const joinWavs = (parts: Buffer[]): Buffer => {
  const wavs = parts.map((p, i) => parseWav(p, `part ${i + 1}`));
  const { fmt } = wavs[0];
  if (wavs.some((w) => !w.fmt.equals(fmt))) throw new Error("the parts of the line have different audio formats");
  const data = Buffer.concat(wavs.map((w) => w.data));
  const head = Buffer.alloc(12 + 8 + fmt.length + (fmt.length % 2) + 8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(head.length - 8 + data.length, 4);
  head.write("WAVEfmt ", 8, "latin1");
  head.writeUInt32LE(fmt.length, 16);
  fmt.copy(head, 20);
  head.write("data", head.length - 8, "latin1");
  head.writeUInt32LE(data.length, head.length - 4);
  return Buffer.concat([head, data]);
};

const round = (x: number) => Math.round(x * 1000) / 1000;

const frames = (seconds: number) => Math.ceil(seconds * fps() - 1e-6);

const SECONDS_PER_CHAR = 0.15;
const GAP_SECONDS = 0.3;

export const voiceOf = <P extends SpeechProps>(props: P): Omit<P, keyof SpeechProps> => {
  const { children, name, reading, gap, "gain-db": db, id, at, len, ...voice } = props;
  return voice;
};

export const line = async (
  kind: string,
  props: SpeechProps,
  who: string,
  voice: object,
  synthesize: (say: string, out: string) => Promise<void>,
): Promise<JSX.Element> => {
  const { say, show } = speechText(props.children, props.reading);
  if (!say) throw new Error("there is nothing to say (the text is empty)");
  const db = props["gain-db"];
  const volume = db === undefined ? undefined : round(10 ** (db / 20));
  const label = `${props.name ?? who}: ${show}`;
  const gap = props.gap ?? Math.round(GAP_SECONDS * fps());
  const make = () => synthesized(kind, voice, say, (out) => synthesize(say, out));
  if (isDraft() && !(await Bun.file(cacheFile(kind, voice, say)).exists())) {
    waitFor(make());
    return (
      <dur id={props.id} at={props.at} len={props.len ?? frames([...say].length * SECONDS_PER_CHAR) + gap}>
        <audio draft volume={volume} label={label} />
      </dur>
    );
  }
  const file = await make();
  return (
    <dur id={props.id} at={props.at} len={props.len ?? frames(wavSeconds(Buffer.from(await Bun.file(file).arrayBuffer()), file)) + gap}>
      <audio src={relative(root, file).split(sep).join("/")} volume={volume} label={label} />
    </dur>
  );
};
