import { basename, resolve } from "node:path";
import { ENGINE_NAMES, SITE_NAMES } from "./choices.ts";
export const packageName = (dir: string): string => {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[._-]+|-+$/g, "");
  return name || "my-video";
};

const MARKER = /\s*<!--\s*#if\s+(.+?)\s*-->\s*$/;
const NAMES: readonly string[] = [...ENGINE_NAMES, ...SITE_NAMES];

export const keepLines = (text: string, chosen: readonly string[]): string =>
  text
    .split("\n")
    .flatMap((line) => {
      const m = MARKER.exec(line);
      if (!m) return [line];
      const names = m[1].split(/\s+/);
      const unknown = names.find((n) => !NAMES.includes(n));
      if (unknown !== undefined) throw new Error(`the template has #if ${unknown}: not an engine or an upload site`);
      return names.some((n) => chosen.includes(n)) ? [line.slice(0, m.index)] : [];
    })
    .join("\n");
