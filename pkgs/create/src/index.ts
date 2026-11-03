#!/usr/bin/env bun
import { Command, InvalidArgumentError } from "commander";
import { VERSION } from "./create.ts";
import { run, type Args } from "./prompts.ts";
import { ENGINE_NAMES, isEngine, type Engine } from "./engine.ts";
import { SITE_NAMES, isSite, type Site } from "./site.ts";
const parseEngines = (value: string, previous: Engine[] = []): Engine[] => {
  const names = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const unknown = names.find((n) => !isEngine(n));
  if (unknown !== undefined) throw new InvalidArgumentError(`unknown engine ${JSON.stringify(unknown)} (${ENGINE_NAMES.join(", ")})`);
  return ENGINE_NAMES.filter((e) => previous.includes(e) || names.includes(e));
};

const parseSites = (value: string, previous: Site[] = []): Site[] => {
  const names = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const unknown = names.find((n) => !isSite(n));
  if (unknown !== undefined) throw new InvalidArgumentError(`unknown upload site ${JSON.stringify(unknown)} (${SITE_NAMES.join(", ")})`);
  return SITE_NAMES.filter((s) => previous.includes(s) || names.includes(s));
};

new Command("create-mekuru")
  .description(
    "Creates a Mekuru Movie Maker video project. In a terminal, it asks for what the options do not give; " +
      "with --yes (or when the input is not a terminal), it uses the defaults.",
  )
  .version(VERSION)
  .argument("[folder]", "the folder of the project (default: my-video)")
  .option("--engine <engines>", `the speech engines, separated by commas: ${ENGINE_NAMES.join(", ")} (default: none)`, parseEngines)
  .option("--upload <sites>", `where to upload the video, separated by commas: ${SITE_NAMES.join(", ")} (default: none)`, parseSites)
  .option("-f, --force", "write into a folder that is not empty")
  .option("-y, --yes", "do not ask")
  .option("--mekuru <spec>", "the version of the @mekuru/types package to depend on", `^${VERSION}`)
  .showHelpAfterError("(add --help for more information)")
  .action(async (dir: string | undefined, { engine, ...opts }: Omit<Args, "dir" | "engines"> & { engine?: Engine[] }) => {
    process.exitCode = await run({ ...opts, dir, engines: engine });
  })
  .parseAsync()
  .then(() => process.exit());
