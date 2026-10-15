import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { toXml } from "./xml.js";

const output = new AsyncLocalStorage<{ draft: boolean; waits: Set<Promise<unknown>> }>();

export const isDraft = (): boolean => output.getStore()?.draft ?? false;

export const waitFor = (work: Promise<unknown>): void => {
  work.catch(() => {});
  output.getStore()?.waits.add(work);
};

export const writeXml = async (path: string, video: unknown): Promise<void> => {
  const context = { draft: true, waits: new Set<Promise<unknown>>() };
  await output.run(context, async () => {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const save = async () => {
      const xml = await toXml(video);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(tmp, xml);
      await rename(tmp, path);
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
