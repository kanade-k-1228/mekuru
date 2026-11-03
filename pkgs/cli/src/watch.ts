import { unwatchFile, watch, watchFile } from "node:fs";
import { basename, dirname } from "node:path";

export const watchXml = (path: string, changed: () => void): (() => void) => {
  if (path.startsWith("/mnt/")) {
    watchFile(path, { interval: 500 }, changed);
    return () => unwatchFile(path, changed);
  }
  const watcher = watch(dirname(path), (_event, name) => {
    if (name === null || name.toString() === basename(path)) changed();
  });
  return () => watcher.close();
};
