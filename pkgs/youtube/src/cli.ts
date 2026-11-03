#!/usr/bin/env bun
import { Command } from "commander";
import { main, DEFAULT } from "./command.ts";
const VERSION: string = (await Bun.file(new URL("../package.json", import.meta.url)).json()).version;
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
