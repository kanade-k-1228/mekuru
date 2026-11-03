import { rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { builds, context as newContext } from "./context.ts";
import { toXml } from "./xml.ts";

export const writeXml = async (path: string, video: unknown): Promise<void> => {
  const context = newContext(true);
  const file = resolve(context.root, path);
  await builds.run(context, async () => {
    const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const save = async () => {
      const xml = await toXml(video);
      await Bun.write(tmp, xml);
      await rename(tmp, file);
    };
    try {
      await save();
      context.draft = false;
      if (context.waits.size === 0) return;
      await Promise.all(context.waits);
      await save();
    } finally {
      context.draft = false;
      context.waits.clear();
      await rm(tmp, { force: true });
    }
  });
};
