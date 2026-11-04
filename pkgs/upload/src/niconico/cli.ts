#!/usr/bin/env bun
import { command, descriptionOf, readUploads, run, type Settings, type Site } from "../common.ts";
import { login, upload, UPLOAD_URL } from "./browser.ts";

const NICONICO: Site = {
  config: "configs/niconico.yaml",
  keys: ["video", "title", "description", "tags", "thumbnail"],
};

const sheet = (s: Settings, file: string, thumbnail?: string): string =>
  [
    `video: ${file}`,
    ...(thumbnail ? [`thumbnail: ${thumbnail}`] : []),
    `title: ${s.title}`,
    `tags:  ${(s.tags ?? []).join(" ")}`,
    "description:",
    descriptionOf(s.description),
  ].join("\n");

const post = async (configs: string[], { check = false }: { check?: boolean }): Promise<void> => {
  const posts = await readUploads(configs, NICONICO);
  for (const { config, settings, file, thumbnail } of posts) {
    if (posts.length > 1) console.log(`${config}:`);
    try {
      const id = await upload(file, settings, { check, thumbnail });
      if (check) continue;
      console.log(id ? `posted: https://www.nicovideo.jp/watch/${id}` : "posted (its ID was not shown: see your videos in niconico)");
    } catch (e) {
      console.error(`error: ${(e as Error).message}\n`);
      console.error(`Post it by hand in the upload page instead (${UPLOAD_URL}):\n\n${sheet(settings, file, thumbnail)}`);
      process.exit(1);
    }
  }
};

const program = command(
  "mekuru-niconico",
  NICONICO,
  "Posts videos to niconico, one for each YAML file with its settings: the video file, the title, description, tags and thumbnail. " +
    "The paths are relative to the current folder (the project). It fills in the upload page in a headless browser " +
    "(niconico has no API for it). Sign in once with `mekuru-niconico login`.",
)
  .usage("[options] [config...]\n       mekuru-niconico login")
  .option("--check", "fill in the form in a browser window, and leave the posting to you")
  .helpCommand(false)
  .action(post);

program
  .command("login")
  .description("open a browser window to sign in to niconico (kept for the next uploads)")
  .action(async () => {
    await login();
    console.log("signed in to niconico");
  });

run(program);
