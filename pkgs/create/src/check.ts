import { homedir } from "node:os";
import { join } from "node:path";
import type { Engine } from "./engine.ts";
import type { Site } from "./site.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const output = async (cmd: string, args: string[]): Promise<string | undefined> => {
  try {
    const child = Bun.spawn([cmd, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 10_000, killSignal: "SIGKILL" });
    const [text, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return code === 0 ? text : undefined;
  } catch {
    return undefined;
  }
};

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

const voisona = async (): Promise<Check> => {
  const name = "VoiSona Talk";
  const at = (process.env.MEKURU_VOISONA_URL || "http://localhost:32766").replace(/\/+$/, "");
  const user = process.env.MEKURU_VOISONA_USER;
  const password = process.env.MEKURU_VOISONA_PASSWORD;
  const credentials = "set MEKURU_VOISONA_USER (the email you sign in with) and MEKURU_VOISONA_PASSWORD (the API password in its preferences)";
  if (!user || !password) return { name, ok: false, detail: credentials };
  try {
    const res = await fetch(`${at}/api/talk/v1/voices`, {
      headers: { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 401) return { name, ok: false, detail: `the email or the API password is wrong: ${credentials}` };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { items } = (await res.json()) as { items: { voice_name: string }[] };
    return { name, ok: true, detail: `${new Set(items.map((v) => v.voice_name)).size} voices at ${at}` };
  } catch {
    return {
      name,
      ok: false,
      detail: `the REST API is not running at ${at}. Start VoiSona Talk (1.3.7 or later) and turn on its REST API in the preferences\n(if it runs elsewhere, as on Windows from WSL2 without mirrored networking, set MEKURU_VOISONA_URL)`,
    };
  }
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
  voisona,
};

const youtube = async (): Promise<Check> => {
  const dir =
    process.env.MEKURU_CONFIG_DIR ||
    (process.platform === "win32"
      ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mekuru")
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "mekuru"));
  const file = join(dir, "youtube-client.json");
  if (await Bun.file(file).exists()) return { name: "YouTube", ok: true, detail: `the OAuth client is ${file}` };
  return {
    name: "YouTube",
    ok: false,
    detail: `no OAuth client: make one (a desktop app) in your Google Cloud project, and save its JSON as ${file}\n(https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.md)`,
  };
};

export const check = (engines: readonly Engine[], sites: readonly Site[] = []): Promise<Check[]> =>
  Promise.all([ffmpeg(), ...engines.map((e) => CHECKS[e]()), ...(sites.includes("youtube") ? [youtube()] : [])]);
