import { resolve } from "node:path";
import { upload, UPLOAD_URL } from "./browser.ts";
import { readSettings, sheet } from "./settings.ts";

export const DEFAULT = "configs/niconico.yaml";

export const post = async (configs: string[], { check = false, headed = false }: { check?: boolean; headed?: boolean }): Promise<void> => {
  const posts = await Promise.all(
    (configs.length ? configs : [DEFAULT]).map(async (config) => {
      const settings = await readSettings(config);
      const file = resolve(settings.video ?? "video.mp4");
      const thumbnail = settings.thumbnail === undefined ? undefined : resolve(settings.thumbnail);
      for (const f of [file, thumbnail]) if (f && !(await Bun.file(f).exists())) throw new Error(`${f} does not exist (in ${config})`);
      return { config, settings, file, thumbnail };
    }),
  );
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
