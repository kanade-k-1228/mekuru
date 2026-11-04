#!/usr/bin/env bun
import { Command, InvalidArgumentError } from "commander";
import { VERSION } from "./create.ts";
import { run, type Args } from "./prompts.ts";
import { ENGINE_NAMES, type Engine } from "./engine.ts";
import { SITE_NAMES } from "./site.ts";
const parseList =
  <T extends string>(what: string, all: readonly T[]) =>
  (value: string, previous: T[] = []): T[] => {
    const names = value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    const unknown = names.find((n) => !(all as readonly string[]).includes(n));
    if (unknown !== undefined) throw new InvalidArgumentError(`unknown ${what} ${JSON.stringify(unknown)} (${all.join(", ")})`);
    return all.filter((n) => previous.includes(n) || names.includes(n));
  };

new Command("create-mekuru")
  .description(
    "Creates a Mekuru Movie Maker video project. In a terminal, it asks for what the options do not give; " +
      "with --yes (or when the input is not a terminal), it uses the defaults.",
  )
  .version(VERSION)
  .argument("[folder]", "the folder of the project (default: my-video)")
  .option("--engine <engines>", `the speech engines, separated by commas: ${ENGINE_NAMES.join(", ")} (default: none)`, parseList("engine", ENGINE_NAMES))
  .option("--upload <sites>", `where to upload the video, separated by commas: ${SITE_NAMES.join(", ")} (default: none)`, parseList("upload site", SITE_NAMES))
  .option("-f, --force", "write into a folder that is not empty")
  .option("-y, --yes", "do not ask")
  .option("--mekuru <spec>", "the version of the @mekuru/types package to depend on", `^${VERSION}`)
  .showHelpAfterError("(add --help for more information)")
  .action(async (dir: string | undefined, { engine, ...opts }: Omit<Args, "dir" | "engines"> & { engine?: Engine[] }) => {
    process.exitCode = await run({ ...opts, dir, engines: engine });
  })
  .parseAsync()
  .then(() => process.exit());
