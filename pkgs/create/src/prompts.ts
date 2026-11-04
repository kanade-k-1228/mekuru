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
  const tty = !args.yes && process.stdin.isTTY && process.stdout.isTTY;
  if (tty) p.intro("@mekuru/create");
  try {
    const answers = tty ? await ask(args) : { ...args, dir: args.dir ?? "my-video", engines: args.engines ?? [], upload: args.upload ?? [] };
    const target = await create(answers.dir, answers);
    const created = `Created a Mekuru Movie Maker project in ${relative(process.cwd(), target) || "."}`;
    const steps = nextSteps(target, answers.upload);
    if (!tty) {
      console.log(`\n${created}\n\nNext:\n${steps.replace(/^/gm, "  ")}\n`);
      const { ok, detail } = await checkFfmpeg();
      console.log(`${ok ? "✓" : "✗"} ffmpeg: ${detail}\n`);
      return 0;
    }
    p.log.success(created);
    p.note(steps, "Next");
    const spin = p.spinner();
    spin.start("Checking ffmpeg");
    const { ok, detail } = await checkFfmpeg();
    if (ok) spin.stop(`ffmpeg: ${detail}`);
    else spin.error(`ffmpeg: ${detail}`);
    p.outro("Done");
    return 0;
  } catch (e) {
    const message = e instanceof Cancelled ? "Cancelled" : `error: ${(e as Error).message}`;
    if (tty) p.cancel(message);
    else console.error(message);
    return 1;
  }
};
