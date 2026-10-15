import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { JSX } from "@mekuru/core";
import { limit, run } from "@mekuru/speech/engine";
import { joinWavs, line, voiceOf, type SpeechProps } from "@mekuru/speech";

const DOWNLOAD = "https://www.a-quest.com/products/aquestalkplayer.html";
const MAC_PROGRAM = "Contents/MacOS/AquesTalkPlayer";
const MAX_CHARS = 100;

export interface AquestalkProps extends SpeechProps {
  preset: string;
  phonetic?: boolean;
  exe?: string;
  "max-chars"?: number;
}

const isWsl = !!process.env.WSL_INTEROP || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop");

const wslpath = async (to: "-u" | "-w", path: string): Promise<string> => {
  return (await run("wslpath", [to, path])).stdout.trim();
};

const windowsFolder = async (variable: string): Promise<string> => {
  const dir = (await run("cmd.exe", ["/d", "/c", `echo %${variable}%`], { cwd: "/mnt/c" })).stdout.trim();
  if (!dir || dir.includes("%")) throw new Error(`could not find the Windows folder %${variable}%`);
  return wslpath("-u", dir);
};

let windowsTemp: Promise<string> | undefined;

const places = async (): Promise<string[]> => {
  const exe = (dir: string) => join(dir, "AquesTalkPlayer", "AquesTalkPlayer.exe");
  if (process.platform === "darwin") return ["/Applications", join(homedir(), "Applications")].map((dir) => join(dir, "AquesTalkPlayer.app", MAC_PROGRAM));
  if (process.platform === "win32")
    return [process.env.LOCALAPPDATA, process.env.ProgramFiles ?? "C:\\Program Files"].filter((dir) => dir !== undefined).map(exe);
  if (isWsl) return [await windowsFolder("LOCALAPPDATA").catch(() => undefined), "/mnt/c/Program Files"].filter((dir) => dir !== undefined).map(exe);
  return [];
};

const findPlayer = async (exe = process.env.MEKURU_AQUESTALKPLAYER): Promise<string | undefined> => {
  if (!exe) {
    for (const place of await places()) if (await Bun.file(place).exists()) return place;
    return undefined;
  }
  let path = isWsl && /^[a-z]:[\\/]/i.test(exe) ? await wslpath("-u", exe).catch(() => exe) : exe;
  if (/\.app\/?$/.test(path)) path = join(path, MAC_PROGRAM);
  return (await Bun.file(path).exists()) ? resolve(path) : undefined;
};

const notFound = (exe: string | undefined): Error => {
  return new Error(
    `${exe ? `AquesTalkPlayer is not at ${exe}` : "AquesTalkPlayer is not found"} (AquesTalkPlayer が見つかりません).\n` +
      `  - download it (free) from ${DOWNLOAD} and unzip it anywhere\n` +
      "  - set `exe` on `<Aquestalk>`, or the MEKURU_AQUESTALKPLAYER environment variable, to its AquesTalkPlayer.exe\n" +
      "    (on macOS: /Applications/AquesTalkPlayer.app/Contents/MacOS/AquesTalkPlayer)\n" +
      "  - it runs on Windows (also from WSL) and on macOS",
  );
};

const oneLine = (text: string): string => {
  return text
    .replace(/"/g, "")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/ {2,}/g, " ")
    .trim();
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

const CONCURRENCY = 2;
const TIMEOUT = 60_000;

const ERRORS: Record<number, string> = {
  2000: "予期せぬエラー",
  2001: "システム辞書(aqdic.bin)が不正",
  2002: "ユーザ辞書(aq_user.dic)が不正",
  2003: "AqKanji2Koe初期化エラー",
  2004: "音声記号列が指定されていない",
  2005: "DLLのロード失敗",
  2006: "不正なDLL",
  2007: "PHONTファイルの読み込み失敗",
  2008: "音声記号列に未定義の読み記号が指定された",
  2009: "音声記号列のタグの指定が正しくない",
  2010: "発話文が長すぎる",
  2011: "Phontファイルが不正",
  2012: "音声記号列が正しくない？",
  2013: "メモリ不足",
  2014: "テキストが空文",
  2015: "AqKanji2Koe変換エラー",
  2016: "WAVファイルの書き込みができない",
  2017: "プリセットファイルが壊れてる",
  2018: "プリセットファイルが開けない",
  2019: "プリセット名の指定が正しくない",
  2020: "プリセットファイルの書き込み失敗",
  2021: "指定のプリセット名が見つからない",
  2022: "指定のテキストファイルが開けない",
  10: "予期せぬエラー",
  11: "辞書ファイルのコピーの失敗",
  14: "音声記号列が指定されていない",
  15: "DLLのロード失敗",
  16: "不正なDLL",
  17: "PHONTファイルの読み込み失敗",
  21: "Phontデータが正しくない",
  24: "テキストが空文",
  26: "WAVファイルの書き込みができない",
  29: "プリセット名の指定が正しくない",
  32: "指定のテキストファイルが開けない",
  100: "AquesTalk その他のエラー",
  101: "メモリ不足",
  102: "音声記号列に未定義の読み記号が指定された",
  103: "音声記号列指定エラー(語頭の長音、促音の連続など)",
  104: "音声記号列に有効な読みがない",
  105: "音声記号列に未定義の読み記号が指定された",
  106: "音声記号列のタグの指定が正しくない",
  107: "タグの長さが制限を越えている（または[>]がみつからない）",
  108: "タグ内の値の指定が正しくない",
  120: "音声記号列が長すぎる",
  121: "１つのフレーズ中の読み記号が多すぎる",
  122: "音声記号列が長い（内部バッファオーバー1）",
  130: "Kanji2Koe その他のエラー",
  131: "関数呼び出し時の引数がNULL",
  134: "初期化されていない(初期化ルーチンが呼ばれていない)",
  135: "入力テキストが長すぎる",
  136: "システム辞書データが指定されていない",
  137: "変換できない文字コードが含まれている",
  138: "システム辞書が壊れている",
  139: "ユーザ辞書が壊れている",
  200: "音声記号列が長すぎる",
  201: "１つのフレーズ中の読み記号が多すぎる",
  202: "音声記号列が長すぎる",
  203: "ヒープメモリ不足",
  204: "音声記号列が長すぎる",
};
const NO_PRESET = [2019, 2021, 29];
const TOO_LONG = [2010, 120, 121, 122, 135, 200, 201, 202, 204];

const failure = (code: number, voice: AquestalkProps, stderr: string): string => {
  let message = `AquesTalkPlayer failed with error ${code} (${ERRORS[code] ?? "unknown error"})`;
  if (NO_PRESET.includes(code))
    message += `\n  AquesTalkPlayer has no preset \`${voice.preset}\`: make it in the window of AquesTalkPlayer, or use "デフォルト"`;
  if (TOO_LONG.includes(code))
    message += `\n  the text is too long for AquesTalk: set a smaller \`max-chars\` on \`<Aquestalk>\` (now ${voice["max-chars"] ?? MAX_CHARS})`;
  return stderr ? `${message}\n${stderr}` : message;
};

const play = async (path: string, args: string[]): Promise<{ code: number; stderr: string }> => {
  try {
    const { code, stderr } = await run(path, args, { cwd: dirname(path), timeout: TIMEOUT, check: false });
    return { code, stderr: stderr.trim().split("\n").slice(-10).join("\n") };
  } catch (e) {
    throw new Error(`could not run AquesTalkPlayer (${path}): ${e instanceof Error ? e.message : String(e)}`);
  }
};

class Player {
  private readonly limited = limit(CONCURRENCY);
  private readonly wsl: boolean;
  private readonly flag: string;

  constructor(private readonly path: string) {
    this.wsl = isWsl && /\.exe$/i.test(path);
    this.flag = process.platform === "win32" || this.wsl ? "/" : "-";
  }

  async say(props: AquestalkProps, text: string, out: string): Promise<void> {
    return this.limited(async () => {
      if (this.wsl) windowsTemp ??= windowsFolder("TEMP");
      const root = join(this.wsl && windowsTemp ? await windowsTemp : tmpdir(), "@mekuru/aquestalk");
      await mkdir(root, { recursive: true });
      const stage = await mkdtemp(join(root, `${process.pid}-`));
      try {
        const wav = join(stage, "line.wav");
        const f = this.flag;
        const args = [`${f}T`, props.phonetic ? `#>${text}` : text, `${f}P`, props.preset, `${f}W`, this.wsl ? await wslpath("-w", wav) : wav];
        const { code, stderr } = await play(this.path, args);
        const error = this.wsl && code >= 208 && code <= 230 ? code + 1792 : code;
        if (error !== 0) throw new Error(failure(error, props, stderr));
        if (!(await Bun.file(wav).exists())) throw new Error("AquesTalkPlayer made no audio");
        await Bun.write(out, Bun.file(wav));
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
}

const players = new Map<string, Promise<Player>>();

const player = (exe: string | undefined): Promise<Player> => {
  const given = exe || process.env.MEKURU_AQUESTALKPLAYER;
  const key = given ?? "";
  let found = players.get(key);
  if (!found) {
    found = findPlayer(given).then((path) => {
      if (!path) throw notFound(given);
      return new Player(path);
    });
    found.catch(() => players.delete(key));
    players.set(key, found);
  }
  return found;
};

export const Aquestalk = async (props: AquestalkProps): Promise<Awaited<JSX.Element>> => {
  const { exe, ...voice } = voiceOf(props);
  return line("aquestalk", props, props.preset, voice, async (say, out) => {
    const aquestalk = await player(exe);
    const texts = splitText(oneLine(say), props["max-chars"] ?? MAX_CHARS);
    if (texts.length === 1) return aquestalk.say(props, texts[0], out);
    const parts = texts.map((_, i) => `${out}.${i}`);
    try {
      await Promise.all(texts.map((text, i) => aquestalk.say(props, text, parts[i])));
      await Bun.write(out, joinWavs(await Promise.all(parts.map(async (part) => Buffer.from(await Bun.file(part).arrayBuffer())))));
    } finally {
      await Promise.all(parts.map((part) => rm(part, { force: true })));
    }
  });
};
