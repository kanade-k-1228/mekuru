import { unwatchFile, watch, watchFile } from "node:fs";
import { basename, dirname } from "node:path";

const watchChanges = (path: string, changed: () => void): (() => void) => {
  if (path.startsWith("/mnt/")) {
    watchFile(path, { interval: 500 }, changed);
    return () => unwatchFile(path, changed);
  }
  const watcher = watch(dirname(path), (_event, name) => {
    if (name === null || name.toString() === basename(path)) changed();
  });
  return () => watcher.close();
};

/** Accept two identical reads 10 ms apart after the last filesystem notification. */
export const watchXml = (path: string, changed: (text: string) => void): (() => void) => {
  let closed = false;
  let generation = 0;
  let candidate: string | undefined;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sample = async () => {
    const version = generation;
    let text: string;
    try {
      text = await Bun.file(path).text();
    } catch {
      if (!closed && version === generation && ++failures < 3) timer = setTimeout(sample, 10);
      return;
    }
    if (closed || version !== generation) return;
    failures = 0;
    if (text === candidate) {
      candidate = undefined;
      changed(text);
    } else {
      candidate = text;
      timer = setTimeout(sample, 10);
    }
  };
  const stop = watchChanges(path, () => {
    generation++;
    candidate = undefined;
    failures = 0;
    clearTimeout(timer);
    timer = setTimeout(sample, 10);
  });
  return () => {
    closed = true;
    clearTimeout(timer);
    stop();
  };
};
