#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { Command, InvalidArgumentError } from "commander";
import { relative, resolve } from "node:path";
import { check, type Check } from "./check.ts";
import { create, isEmptyDir, VERSION, type CreateOptions } from "./create.ts";
import { ENGINE_NAMES, ENGINES, isEngine, type Engine } from "./engine.ts";
import { isSite, SITE_NAMES, SITES, type Site } from "./site.ts";

interface Args extends CreateOptions {
  dir?: string;
  yes?: boolean;
}

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

class Cancelled extends Error {}

const answer = <T>(value: T): Exclude<T, symbol> => {
  if (p.isCancel(value)) throw new Cancelled();
  return value as Exclude<T, symbol>;
};

const ask = async (args: Args): Promise<Args & { dir: string; engines: readonly Engine[]; upload: readonly Site[] }> => {
  const dir = args.dir ?? (answer(await p.text({ message: "Project folder", placeholder: "my-video", defaultValue: "my-video" })).trim() || "my-video");
  if (!args.force && !isEmptyDir(resolve(dir))) {
    if (!answer(await p.confirm({ message: `${dir} is not empty. Write into it anyway?`, initialValue: false }))) throw new Cancelled();
  }
  const engines =
    args.engines ??
    answer(
      await p.multiselect({
        message: "Speech engines (You can add them later)",
        options: ENGINE_NAMES.map((e) => ({ value: e, label: ENGINES[e].name, hint: ENGINES[e].hint })),
        required: false,
      }),
    );
  const upload =
    args.upload ??
    answer(
      await p.multiselect({
        message: "Upload to (You can add it later)",
        options: SITE_NAMES.map((s) => ({ value: s, label: SITES[s].name, hint: SITES[s].hint })),
        required: false,
      }),
    );
  return { ...args, dir, force: true, engines, upload };
};

const UPLOAD_STEPS: Record<Site, string> = {
  youtube: "bun run upload:youtube    # upload video.mp4 with configs/youtube.yaml",
  niconico: "bun run upload:niconico   # post video.mp4 with configs/niconico.yaml (sign in once: bunx mekuru-niconico login)",
};

const nextSteps = (target: string, sites: readonly Site[]): string => {
  const cd = relative(process.cwd(), target) || ".";
  return [
    ...(cd === "." ? [] : [`cd ${cd.includes(" ") ? JSON.stringify(cd) : cd}`]),
    "bun install",
    "bun preview      # open the viewer (it follows src/main.tsx as you save it)",
    "bun run build    # render video.mp4",
    ...sites.map((s) => UPLOAD_STEPS[s]),
  ].join("\n");
};

const line = (c: Check): string => `${c.name}: ${c.detail}`.replace(/\n/g, "\n  ");

const run = async (args: Args): Promise<number> => {
  if (args.yes || !process.stdin.isTTY || !process.stdout.isTTY) {
    const engines = args.engines ?? [];
    const upload = args.upload ?? [];
    try {
      const target = await create(args.dir ?? "my-video", { ...args, engines, upload });
      const steps = nextSteps(target, upload).replace(/^/gm, "  ");
      console.log(`\nCreated a Mekuru Movie Maker project in ${relative(process.cwd(), target) || "."}\n\nNext:\n${steps}\n`);
      const checks = (await check(engines, upload)).map((c) => `${c.ok ? "✓" : "✗"} ${line(c)}`.replace(/^/gm, "  "));
      console.log(`Tools:\n${checks.join("\n")}\n`);
      return 0;
    } catch (e) {
      console.error(`error: ${(e as Error).message}`);
      return 1;
    }
  }
  p.intro("@mekuru/create");
  try {
    const answers = await ask(args);
    const target = await create(answers.dir, answers);
    p.log.success(`Created a Mekuru Movie Maker project in ${relative(process.cwd(), target) || "."}`);
    p.note(nextSteps(target, answers.upload), "Next");
    const { engines } = answers;
    const spin = p.spinner();
    spin.start(engines.length > 0 || answers.upload.length > 0 ? "Checking ffmpeg and the other tools" : "Checking ffmpeg");
    const checks = await check(engines, answers.upload);
    spin.stop(checks.every((c) => c.ok) ? "All the tools are ready" : "Some tools are missing");
    for (const c of checks) (c.ok ? p.log.success : p.log.warn)(line(c));
    p.outro("Done");
    return 0;
  } catch (e) {
    p.cancel(e instanceof Cancelled ? "Cancelled" : `error: ${(e as Error).message}`);
    return 1;
  }
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
  .option("--mekuru <spec>", "the version of the @mekuru/core package to depend on", `^${VERSION}`)
  .showHelpAfterError("(add --help for more information)")
  .action(async (dir: string | undefined, { engine, ...opts }: Omit<Args, "dir" | "engines"> & { engine?: Engine[] }) => {
    process.exitCode = await run({ ...opts, dir, engines: engine });
  })
  .parseAsync()
  .then(() => process.exit());
