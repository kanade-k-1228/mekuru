import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, win32 } from "node:path";
import { promisify } from "node:util";
import type { Engine } from "./character.js";
import type { Site } from "./site.js";

const run = promisify(execFile);

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const output = (cmd: string, args: string[]): Promise<string | undefined> =>
  run(cmd, args, { timeout: 10_000 }).then(
    (r) => r.stdout,
    () => undefined,
  );

const ffmpeg = async (): Promise<Check> => {
  const ffmpeg = process.env.MEKURU_FFMPEG || "ffmpeg";
  const ffprobe = process.env.MEKURU_FFPROBE || "ffprobe";
  const [version, encoders, probe] = await Promise.all([
    output(ffmpeg, ["-version"]),
    output(ffmpeg, ["-hide_banner", "-encoders"]),
    output(ffprobe, ["-version"]),
  ]);
  const missing =
    version === undefined
      ? `${ffmpeg} is not found`
      : probe === undefined
        ? `${ffprobe} is not found`
        : !/\blibx264\b/.test(encoders ?? "")
          ? `${ffmpeg} has no libx264`
          : undefined;
  if (missing) return { name: "ffmpeg", ok: false, detail: `${missing} (install ffmpeg with libx264, or set MEKURU_FFMPEG / MEKURU_FFPROBE)` };
  return { name: "ffmpeg", ok: true, detail: /version (\S+)/.exec(version ?? "")?.[1] ?? "found" };
};

const http = async (name: string, env: string, url: string, path: string, start: string, show: (body: unknown) => string): Promise<Check> => {
  const at = (process.env[env] || url).replace(/\/+$/, "");
  try {
    const res = await fetch(at + path, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { name, ok: true, detail: `${show(await res.json())} at ${at}` };
  } catch {
    return {
      name,
      ok: false,
      detail: `the engine is not running at ${at}. ${start}\n(if it runs elsewhere, as on Windows from WSL2 without mirrored networking, set ${env})`,
    };
  }
};

const version = (body: unknown) => String(body);

const isWsl = !!process.env.WSL_INTEROP || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop");

const local = async (path: string): Promise<string | undefined> => (isWsl ? (await output("wslpath", ["-u", path]))?.trim() : path);

const programFiles = (...path: string[]) => win32.join((process.platform === "win32" && process.env.ProgramFiles) || "C:\\Program Files", ...path);

const localAppData = async (): Promise<string | undefined> => {
  if (process.platform === "win32") return process.env.LOCALAPPDATA;
  const dir = (await output("cmd.exe", ["/d", "/c", "echo %LOCALAPPDATA%"]))?.trim();
  return dir && !dir.includes("%") ? dir : undefined;
};

const find = async (paths: (string | undefined)[]): Promise<string | undefined> => {
  for (const path of paths) {
    if (!path) continue;
    const at = /^[A-Za-z]:\\/.test(path) && process.platform !== "win32" ? isWsl && (await local(path)) : path;
    if (at && existsSync(at)) return path;
  }
  return undefined;
};

const onWindows = process.platform === "win32" || isWsl;
const windowsOnly = (name: string): Check => ({ name, ok: false, detail: "runs only on Windows (or from WSL)" });

const cevio = async (): Promise<Check> => {
  if (!onWindows) return windowsOnly("CeVIO AI");
  const dll = programFiles("CeVIO", "CeVIO AI", "CeVIO.Talk.RemoteService2.dll");
  if (!(await find([dll])))
    return { name: "CeVIO AI", ok: false, detail: `not installed (${dll} is not found; install it, or set dll-dir on <Cevio> in src/character/)` };
  return { name: "CeVIO AI", ok: true, detail: `${win32.dirname(dll)} (set the casts in src/character/ to ones you have)` };
};

const aivoice = async (): Promise<Check> => {
  if (!onWindows) return windowsOnly("A.I.VOICE");
  const dll = programFiles("AI", "AIVoice", "AIVoiceEditor", "AI.Talk.Editor.Api.dll");
  if (!(await find([dll])))
    return {
      name: "A.I.VOICE",
      ok: false,
      detail: `not installed (${dll} is not found; install A.I.VOICE Editor, or set dll-dir on <Aivoice> in src/character/)`,
    };
  return { name: "A.I.VOICE", ok: true, detail: `${win32.dirname(dll)} (set the voices in src/character/ to ones you have)` };
};

const voicepeak = async (): Promise<Check> => {
  const env = process.env.MEKURU_VOICEPEAK;
  const path =
    (await find([env])) ??
    (onWindows ? await find([programFiles("VOICEPEAK", "voicepeak.exe")]) : undefined) ??
    (process.platform === "darwin" ? await find(["/Applications/voicepeak.app/Contents/MacOS/voicepeak"]) : undefined) ??
    (process.platform === "linux" && !isWsl ? (await output("sh", ["-c", "command -v voicepeak"]))?.trim() || undefined : undefined);
  if (!path) return { name: "VOICEPEAK", ok: false, detail: "not found (install VOICEPEAK, or set MEKURU_VOICEPEAK to its program)" };
  return { name: "VOICEPEAK", ok: true, detail: `${path} (set the narrators in src/character/ to ones you have)` };
};

const aquestalk = async (): Promise<Check> => {
  const appData = onWindows ? await localAppData() : undefined;
  const path = await find([
    process.env.MEKURU_AQUESTALKPLAYER,
    appData && win32.join(appData, "AquesTalkPlayer", "AquesTalkPlayer.exe"),
    onWindows ? programFiles("AquesTalkPlayer", "AquesTalkPlayer.exe") : undefined,
    process.platform === "darwin" ? "/Applications/AquesTalkPlayer.app/Contents/MacOS/AquesTalkPlayer" : undefined,
    process.platform === "darwin" ? join(homedir(), "Applications/AquesTalkPlayer.app/Contents/MacOS/AquesTalkPlayer") : undefined,
  ]);
  const presets = "make the presets れいむ (AquesTalk1 f1) and まりさ (f2) in it";
  if (!path) {
    return {
      name: "AquesTalkPlayer",
      ok: false,
      detail: `not found: get it from https://www.a-quest.com/products/aquestalkplayer.html, ${presets},\nand set MEKURU_AQUESTALKPLAYER to AquesTalkPlayer.exe unless it is in %LOCALAPPDATA%\\AquesTalkPlayer`,
    };
  }
  return { name: "AquesTalkPlayer", ok: true, detail: `${path} (${presets}; monetized videos need a licence: https://www.a-quest.com/licence_video.html)` };
};

const CHECKS: Record<Engine, () => Promise<Check>> = {
  voicevox: () =>
    http(
      "VOICEVOX",
      "MEKURU_VOICEVOX_URL",
      "http://127.0.0.1:50021",
      "/version",
      "Start the VOICEVOX app, or\n  docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest",
      version,
    ),
  aivisspeech: () =>
    http(
      "AivisSpeech",
      "MEKURU_AIVISSPEECH_URL",
      "http://127.0.0.1:10101",
      "/version",
      "Start the AivisSpeech app, or\n  docker run --rm -p 127.0.0.1:10101:10101 ghcr.io/aivis-project/aivisspeech-engine:cpu-latest",
      version,
    ),
  sharevox: () => http("SHAREVOX", "MEKURU_SHAREVOX_URL", "http://127.0.0.1:50025", "/version", "Start the SHAREVOX app.", version),
  coeiroink: () =>
    http("COEIROINK", "MEKURU_COEIROINK_URL", "http://127.0.0.1:50032", "/v1/engine_info", "Start the COEIROINK (v2) app.", (body) =>
      String((body as { version?: unknown }).version ?? "running"),
    ),
  "style-bert-vits2": () =>
    http(
      "Style-Bert-VITS2",
      "MEKURU_STYLE_BERT_VITS2_URL",
      "http://127.0.0.1:5000",
      "/models/info",
      "Start its API server (python server_fastapi.py, or Server.bat).",
      (body) => `${Object.keys(body as object).length} models`,
    ),
  aquestalk,
  cevio,
  aivoice,
  voicepeak,
};

const youtube = async (): Promise<Check> => {
  const dir =
    process.env.MEKURU_CONFIG_DIR ||
    (process.platform === "win32"
      ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mekuru")
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "mekuru"));
  const file = join(dir, "youtube-client.json");
  if (existsSync(file)) return { name: "YouTube", ok: true, detail: `the OAuth client is ${file}` };
  return {
    name: "YouTube",
    ok: false,
    detail: `no OAuth client: make one (a desktop app) in your Google Cloud project, and save its JSON as ${file}\n(https://github.com/kanade-k-1228/sasara/blob/main/docs/reference/Upload.md)`,
  };
};

export const check = (engines: readonly Engine[], sites: readonly Site[] = []): Promise<Check[]> =>
  Promise.all([ffmpeg(), ...engines.map((e) => CHECKS[e]()), ...(sites.includes("youtube") ? [youtube()] : [])]);
