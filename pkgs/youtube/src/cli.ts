#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { accessToken, configDir } from "./auth.js";
import { readSettings, videoResource, type VideoResource } from "./settings.js";
import { setThumbnail, uploadVideo } from "./upload.js";

const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const DEFAULT = "configs/youtube.yaml";

const openBrowser = (url: string): void => {
  const wsl = process.platform === "linux" && (!!process.env.WSL_INTEROP || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop"));
  const tries: string[][] = wsl
    ? [["wslview"], ["cmd.exe", "/c", "start", ""]]
    : process.platform === "darwin"
      ? [["open"]]
      : process.platform === "win32"
        ? [["cmd", "/c", "start", ""]]
        : [["xdg-open"]];
  const attempt = (i: number) => {
    if (i >= tries.length) return;
    const [cmd, ...args] = tries[i];
    const target = cmd.startsWith("cmd") ? url.replaceAll("&", "^&") : url;
    const child = spawn(cmd, [...args, target], { stdio: "ignore", detached: true, cwd: wsl ? "/mnt/c" : undefined });
    child.on("error", () => attempt(i + 1));
    child.unref();
  };
  attempt(0);
};

const main = async (configs: string[], { dryRun = false }: { dryRun?: boolean }): Promise<void> => {
  const uploads = (configs.length ? configs : [DEFAULT]).map((config) => {
    const settings = readSettings(config);
    const file = resolve(settings.video ?? "video.mp4");
    const thumbnail = settings.thumbnail === undefined ? undefined : resolve(settings.thumbnail);
    for (const f of [file, thumbnail]) if (f && !existsSync(f)) throw new Error(`${f} does not exist (in ${config})`);
    return { config, file, thumbnail, video: videoResource(settings) };
  });
  if (dryRun) {
    for (const { config, file, thumbnail, video } of uploads) console.log(JSON.stringify({ config, file, thumbnail, ...video }, null, 2));
    console.log(`(the sign-in is kept in ${configDir()})`);
    return;
  }

  const token = await accessToken(openBrowser);
  for (const { config, file, thumbnail, video } of uploads) {
    if (uploads.length > 1) console.log(`${config}:`);
    await uploadOne(file, thumbnail, video, token);
  }
};

const uploadOne = async (file: string, thumbnail: string | undefined, video: VideoResource, token: string): Promise<void> => {
  const tty = process.stderr.isTTY;
  const uploaded = await uploadVideo(file, video, token, {
    progress: (sent, total) =>
      tty && process.stderr.write(`\ruploading ${Math.floor((sent / total) * 100)}% (${(sent / 2 ** 20).toFixed(1)} / ${(total / 2 ** 20).toFixed(1)} MiB)`),
  });
  if (tty) process.stderr.write("\n");
  console.log(`uploaded: https://youtu.be/${uploaded.id}`);
  console.log(`edit:     https://studio.youtube.com/video/${uploaded.id}/edit`);
  const privacy = uploaded.status?.privacyStatus;
  if (privacy && privacy !== video.status.privacyStatus) {
    console.error(
      `note: the video is ${privacy}, not ${video.status.privacyStatus} (YouTube makes the uploads of an API project that has not passed its audit private: change it in YouTube Studio)`,
    );
  }
  if (thumbnail) {
    try {
      await setThumbnail(uploaded.id, thumbnail, token);
    } catch (e) {
      console.error(`warning: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
};

new Command("mekuru-youtube")
  .description(
    "Uploads videos to YouTube, one for each YAML file with its settings: the video file, the title, description, tags, ... " +
      "The paths are relative to the current folder (the project). The first time, it opens the browser to sign in to Google.",
  )
  .version(VERSION)
  .argument("[config...]", `the YAML files of the settings (default: ${DEFAULT})`)
  .option("--dry-run", "show what it would upload, without signing in or uploading")
  .showHelpAfterError("(add --help for more information)")
  .action(main)
  .parseAsync()
  .catch((e: Error) => {
    console.error(`error: ${e.message}`);
    process.exit(1);
  });
