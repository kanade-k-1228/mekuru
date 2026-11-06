import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildValue, projectRoot } from "@mekuru/tsx";
const CACHE_VERSION = 2;

const canonical = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
};

const showSpeech = (p: { done: number; total: number; label: string }): void => {
  const text = `speech ${p.done}/${p.total}  ${p.label.replace(/\s+/g, " ").slice(0, 40)}`;
  if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K${text}${p.done === p.total ? "\n" : ""}`);
  else console.log(text);
};

const SESSION = Symbol("speech");
const session = () => buildValue(SESSION, () => ({ pending: new Map<string, Promise<string>>(), progress: { done: 0, total: 0 } }));

export const cacheFile = (request: object): string => {
  const key = new Bun.CryptoHasher("sha256").update(canonical({ v: CACHE_VERSION, request })).digest("hex");
  return join(projectRoot(), ".mekuru", "cache", "tts", key.slice(0, 2), `${key}.wav`);
};

export const synthesized = (request: object, text: string, synthesize: (out: string) => Promise<void>): Promise<string> => {
  const { pending, progress } = session();
  const file = cacheFile(request);
  let made = pending.get(file);
  if (!made) {
    made = (async () => {
      if (await Bun.file(file).exists()) return file;
      if (progress.total++ === progress.done) setTimeout(() => progress.done < progress.total && showSpeech({ ...progress, label: text }), 30);
      const part = `${file}.${process.pid}.${crypto.randomUUID()}.part`;
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
