#!/usr/bin/env bun
import { Command, InvalidArgumentError, Option } from "commander";
import { VERSION } from "./create.ts";
import { run, type Args } from "./prompts.ts";
import { SITE_NAMES, TEMPLATE_NAMES, type Site } from "./choices.ts";

const parseSites = (value: string, previous: Site[] = []): Site[] => {
  const names = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const unknown = names.find((n) => !SITE_NAMES.some((site) => site === n));
  if (unknown !== undefined) throw new InvalidArgumentError(`unknown upload site ${JSON.stringify(unknown)} (${SITE_NAMES.join(", ")})`);
  return SITE_NAMES.filter((n) => previous.includes(n) || names.includes(n));
};

new Command("create-mekuru")
  .description(
    "Creates a Mekuru Movie Maker video project from an irodoru sample or an empty script. In a terminal, it asks for what the options do not give; " +
      "with --yes (or when the input is not a terminal), it uses the defaults.",
  )
  .version(VERSION)
  .argument("[folder]", "the folder of the project (default: my-video)")
  .addOption(new Option("--template <template>", "the project template (default: sample)").choices(TEMPLATE_NAMES))
  .option("--upload <sites>", `where to upload the video, separated by commas: ${SITE_NAMES.join(", ")} (default: none)`, parseSites)
  .option("-f, --force", "write into a folder that is not empty")
  .option("-y, --yes", "do not ask")
  .showHelpAfterError("(add --help for more information)")
  .action(async (dir: string | undefined, opts: Omit<Args, "dir">) => {
    process.exitCode = await run({ ...opts, dir });
  })
  .parseAsync()
  .then(() => process.exit());
