#!/usr/bin/env bun
import { command, configDir, readUploads, run } from "../common.ts";
import { accessToken } from "./auth.ts";
import { videoResource, YOUTUBE, type VideoResource, type YouTubeSettings } from "./settings.ts";
import { setThumbnail, uploadVideo } from "./upload.ts";

const main = async (configs: string[], { dryRun = false }: { dryRun?: boolean }): Promise<void> => {
  const uploads = (await readUploads<YouTubeSettings>(configs, YOUTUBE)).map((u) => ({ ...u, video: videoResource(u.settings) }));
  if (dryRun) {
    for (const { config, file, thumbnail, video } of uploads) console.log(JSON.stringify({ config, file, thumbnail, ...video }, null, 2));
    console.log(`(the sign-in is kept in ${configDir()})`);
    return;
  }

  const token = await accessToken();
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

run(
  command(
    "mekuru-youtube",
    YOUTUBE,
    "Uploads videos to YouTube, one for each YAML file with its settings: the video file, the title, description, tags, ... " +
      "The paths are relative to the current folder (the project). The first time, it opens the browser to sign in to Google.",
  )
    .option("--dry-run", "show what it would upload, without signing in or uploading")
    .action(main),
);
