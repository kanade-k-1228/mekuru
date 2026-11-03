#!/usr/bin/env bun
import { Command } from "commander";
import { post, DEFAULT } from "./command.ts";
import { login } from "./browser.ts";
const VERSION: string = (await Bun.file(new URL("../package.json", import.meta.url)).json()).version;
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
