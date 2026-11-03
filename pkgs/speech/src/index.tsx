/** @jsxImportSource @mekuru/core */
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fps, isDraft, waitFor, type At, type JSX, type Node, type Time } from "@mekuru/core";
import { speechText } from "./text.tsx";

export { subtitleText } from "./text.tsx";

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
