#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { login, upload, UPLOAD_URL } from "./browser.js";
import { readSettings, sheet } from "./settings.js";

const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const DEFAULT = "configs/niconico.yaml";

const post = async (configs: string[], { check = false, headed = false }: { check?: boolean; headed?: boolean }): Promise<void> => {
  const posts = (configs.length ? configs : [DEFAULT]).map((config) => {
    const settings = readSettings(config);
    const file = resolve(settings.video ?? "video.mp4");
    const thumbnail = settings.thumbnail === undefined ? undefined : resolve(settings.thumbnail);
    for (const f of [file, thumbnail]) if (f && !existsSync(f)) throw new Error(`${f} does not exist (in ${config})`);
    return { config, settings, file, thumbnail };
  });
  for (const { config, settings, file, thumbnail } of posts) {
    if (posts.length > 1) console.log(`${config}:`);
    try {
      const id = await upload(file, settings, { check, headed, thumbnail });
      if (check) continue;
      console.log(id ? `posted: https://www.nicovideo.jp/watch/${id}` : "posted (its ID was not shown: see your videos in niconico)");
    } catch (e) {
      console.error(`error: ${(e as Error).message}\n`);
      console.error(`Post it by hand in the upload page instead (${UPLOAD_URL}):\n\n${sheet(settings, file, thumbnail)}`);
      process.exit(1);
    }
  }
};

const program = new Command("mekuru-niconico")
  .description(
    "Posts videos to niconico, one for each YAML file with its settings: the video file, the title, description, tags and thumbnail. " +
      "The paths are relative to the current folder (the project). It fills in the upload page in a headless browser " +
      "(niconico has no API for it). Sign in once with `@mekuru/niconico login`.",
  )
  .version(VERSION)
  .usage("[options] [config...]\n       @mekuru/niconico login")
  .argument("[config...]", `the YAML files of the settings (default: ${DEFAULT})`)
  .option("--check", "fill in the form in a browser window, and leave the posting to you")
  .option("--headed", "show the browser while it posts")
  .helpCommand(false)
  .showHelpAfterError("(add --help for more information)")
  .action(post);

program
  .command("login")
  .description("open a browser window to sign in to niconico (kept for the next uploads)")
  .action(async () => {
    await login();
    console.log("signed in to niconico");
  });

program.parseAsync().catch((e: Error) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
