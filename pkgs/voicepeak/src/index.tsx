import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { JSX } from "@mekuru/core";
import { joinWavs, line, voiceOf, type SpeechProps } from "@mekuru/speech";

export interface VoicepeakProps extends SpeechProps {
  narrator: string;
  emotion?: Readonly<Record<string, number>>;
  speed?: number;
  pitch?: number;
  bin?: string;
  "max-chars"?: number;
}

const run = promisify(execFile);

const isWsl = !!process.env.WSL_INTEROP || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop");

const installed = (): string => {
  if (process.platform === "win32") return join(process.env.ProgramFiles ?? "C:\\Program Files", "VOICEPEAK", "voicepeak.exe");
  if (process.platform === "darwin") return "/Applications/voicepeak.app/Contents/MacOS/voicepeak";
  const found = [
    isWsl ? "/mnt/c/Program Files/VOICEPEAK/voicepeak.exe" : "",
    join(homedir(), "Documents", "Voicepeak Downloads", "Voicepeak-linux64", "Voicepeak", "voicepeak"),
  ].find((path) => path && existsSync(path));
  return found ?? "voicepeak";
};

const programOf = async (bin: string | undefined): Promise<string> => {
  const path = bin || process.env.MEKURU_VOICEPEAK || installed();
  return isWsl && /^[a-z]:[\\/]/i.test(path) ? (await run("wslpath", ["-u", path])).stdout.trim() : path;
};

const toWindows = async (path: string): Promise<string> => {
  return isWsl ? (await run("wslpath", ["-w", path])).stdout.trim() : path;
};

let temp: Promise<string> | undefined;

const windowsTemp = (): Promise<string> => {
  temp ??= (async () => {
    const found = (await run("cmd.exe", ["/d", "/c", "echo %TEMP%"], { cwd: "/mnt/c" })).stdout.trim();
    if (!found || found.includes("%")) throw new Error("could not find the Windows TEMP folder");
    return (await run("wslpath", ["-u", found])).stdout.trim();
  })();
  return temp;
};

const splitText = (text: string, max: number): string[] => {
  const limit = Math.max(1, Math.floor(max));
  const len = (s: string) => [...s].length;
  if (len(text) <= limit) return [text];
  const sentences: string[] = [];
  let cur = "";
  for (const c of text) {
    cur += c;
    if ("。！？!?\n".includes(c)) {
      sentences.push(cur);
      cur = "";
    }
  }
  if (cur) sentences.push(cur);
  const out: string[] = [];
  let buf = "";
  for (const sentence of sentences) {
    let pieces = [sentence];
    if (len(sentence) > limit) {
      pieces = [];
      let piece = "";
      for (const c of sentence) {
        piece += c;
        if (("、，,".includes(c) && len(piece) >= Math.floor(limit / 2)) || len(piece) >= limit) {
          pieces.push(piece);
          piece = "";
        }
      }
      if (piece) pieces.push(piece);
    }
    for (const piece of pieces) {
      if (len(buf) + len(piece) > limit && buf) {
        out.push(buf);
        buf = "";
      }
      buf += piece;
    }
  }
  if (buf) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
};

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(x)));

const argsOf = (text: string, out: string, voice: VoicepeakProps): string[] => {
  const args = ["-s", text, "-n", voice.narrator, "-o", out];
  const emotion = Object.entries(voice.emotion ?? {});
  if (emotion.length > 0) args.push("-e", emotion.map(([name, value]) => `${name}=${clamp(value, 0, 100)}`).join(","));
  if (voice.speed !== undefined) args.push("--speed", String(clamp(voice.speed, 50, 200)));
  if (voice.pitch !== undefined) args.push("--pitch", String(clamp(voice.pitch, -300, 300)));
  return args;
};

const TIMEOUT = 60_000;
const TRIES = 3;

const runOnce = (bin: string, args: string[], cwd: string): Promise<string | undefined> => {
  return new Promise((done, fail) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const keep = (chunk: Buffer) => (output = (output + chunk.toString()).slice(-4000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => {
      child.kill();
      done(`timed out after ${TIMEOUT / 1000}s`);
    }, TIMEOUT);
    child.on("error", (e) => {
      clearTimeout(timer);
      fail(
        new Error(
          `could not run VOICEPEAK at ${bin} (${e.message}).\n` +
            "  - install VOICEPEAK (https://www.ah-soft.com/voice/), or\n" +
            "  - set `bin` on `<Voicepeak>` or the MEKURU_VOICEPEAK environment variable to its program (voicepeak, or voicepeak.exe)",
        ),
      );
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      done(code === 0 ? undefined : `exit code ${code ?? signal}\n${output.trim().split("\n").slice(-10).join("\n")}`.trim());
    });
  });
};

let last: Promise<unknown> = Promise.resolve();

const speak = (bin: string, voice: VoicepeakProps, text: string): Promise<Buffer> => {
  const task = async () => {
    const windows = isWsl && /\.exe$/i.test(bin);
    const stage = await mkdtemp(join(windows ? await windowsTemp() : tmpdir(), "@mekuru/voicepeak-"));
    try {
      const wav = join(stage, "voice.wav");
      const args = argsOf(text, windows ? await toWindows(wav) : wav, voice);
      let failure = "";
      for (let i = 0; i < TRIES; i++) {
        if (i > 0) await new Promise((wait) => setTimeout(wait, 500 * 2 ** (i - 1)));
        failure = (await runOnce(bin, args, stage)) ?? "";
        const audio = await readFile(wav).catch(() => undefined);
        await rm(wav, { force: true });
        if (!failure && audio && audio.length > 44) return audio;
        failure ||= "no audio was written";
      }
      throw new Error(`VOICEPEAK failed (tried ${TRIES} times): ${failure}\n  (is \`${voice.narrator}\` in \`voicepeak --list-narrator\`?)`);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  };
  const done = last.then(task, task);
  last = done.catch(() => undefined);
  return done;
};

export const Voicepeak = async (props: VoicepeakProps): Promise<Awaited<JSX.Element>> => {
  const { bin, ...voice } = voiceOf(props);
  return line("voicepeak", props, props.narrator, voice, async (say, out) => {
    const program = await programOf(bin);
    const wavs = await Promise.all(splitText(say, props["max-chars"] ?? 140).map((text) => speak(program, props, text)));
    await writeFile(out, wavs.length === 1 ? wavs[0] : joinWavs(wavs));
  });
};
