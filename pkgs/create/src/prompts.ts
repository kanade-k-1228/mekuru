import * as p from "@clack/prompts";
import { relative, resolve } from "node:path";
import { checkFfmpeg } from "./check.ts";
import { create, isEmptyDir, type CreateOptions } from "./create.ts";
import { ENGINE_NAMES, ENGINES, SITE_NAMES, SITES, type Engine, type Site } from "./choices.ts";

export interface Args extends CreateOptions {
  dir?: string;
  yes?: boolean;
}

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

export const run = async (args: Args): Promise<number> => {
  if (args.yes || !process.stdin.isTTY || !process.stdout.isTTY) {
    const engines = args.engines ?? [];
    const upload = args.upload ?? [];
    try {
      const target = await create(args.dir ?? "my-video", { ...args, engines, upload });
      const steps = nextSteps(target, upload).replace(/^/gm, "  ");
      console.log(`\nCreated a Mekuru Movie Maker project in ${relative(process.cwd(), target) || "."}\n\nNext:\n${steps}\n`);
      const { ok, detail } = await checkFfmpeg();
      console.log(`${ok ? "✓" : "✗"} ffmpeg: ${detail}\n`);
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
    const spin = p.spinner();
    spin.start("Checking ffmpeg");
    const { ok, detail } = await checkFfmpeg();
    if (ok) spin.stop(`ffmpeg: ${detail}`);
    else spin.error(`ffmpeg: ${detail}`);
    p.outro("Done");
    return 0;
  } catch (e) {
    p.cancel(e instanceof Cancelled ? "Cancelled" : `error: ${(e as Error).message}`);
    return 1;
  }
};
