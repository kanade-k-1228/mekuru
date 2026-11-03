import { openBrowser } from "@mekuru/platform";
import { resolve } from "node:path";
import { accessToken, configDir } from "./auth.ts";
import { readSettings, videoResource, type VideoResource } from "./settings.ts";
import { setThumbnail, uploadVideo } from "./upload.ts";

export const DEFAULT = "configs/youtube.yaml";

export const main = async (configs: string[], { dryRun = false }: { dryRun?: boolean }): Promise<void> => {
  const uploads = await Promise.all(
    (configs.length ? configs : [DEFAULT]).map(async (config) => {
      const settings = await readSettings(config);
      const file = resolve(settings.video ?? "video.mp4");
      const thumbnail = settings.thumbnail === undefined ? undefined : resolve(settings.thumbnail);
      for (const f of [file, thumbnail]) if (f && !(await Bun.file(f).exists())) throw new Error(`${f} does not exist (in ${config})`);
      return { config, file, thumbnail, video: videoResource(settings) };
    }),
  );
  if (dryRun) {
    for (const { config, file, thumbnail, video } of uploads) console.log(JSON.stringify({ config, file, thumbnail, ...video }, null, 2));
    console.log(`(the sign-in is kept in ${configDir()})`);
    return;
  }

  const token = await accessToken(openBrowser);
  for (const { config, file, thumbnail, video } of uploads) {
    if (uploads.length > 1) console.log(`${config}:`);
    await uploadOne(file, thumbnail, video, token);
  }
};

const uploadOne = async (file: string, thumbnail: string | undefined, video: VideoResource, token: string): Promise<void> => {
  const tty = process.stderr.isTTY;
  const uploaded = await uploadVideo(file, video, token, {
    progress: (sent, total) =>
      tty && process.stderr.write(`\ruploading ${Math.floor((sent / total) * 100)}% (${(sent / 2 ** 20).toFixed(1)} / ${(total / 2 ** 20).toFixed(1)} MiB)`),
  });
  if (tty) process.stderr.write("\n");
  console.log(`uploaded: https://youtu.be/${uploaded.id}`);
  console.log(`edit:     https://studio.youtube.com/video/${uploaded.id}/edit`);
  const privacy = uploaded.status?.privacyStatus;
  if (privacy && privacy !== video.status.privacyStatus) {
    console.error(
      `note: the video is ${privacy}, not ${video.status.privacyStatus} (YouTube makes the uploads of an API project that has not passed its audit private: change it in YouTube Studio)`,
    );
  }
  if (thumbnail) {
    try {
      await setThumbnail(uploaded.id, thumbnail, token);
    } catch (e) {
      console.error(`warning: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
};
