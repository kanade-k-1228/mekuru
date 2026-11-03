import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const FOLDERS = ["体", "髪", "目", "口", "眉", "顔色", "他", "後"] as const;
export type Folder = (typeof FOLDERS)[number];

export const MANY = ["他", "後"] as const satisfies readonly Folder[];
export type Many = (typeof MANY)[number];
export const isMany = (folder: Folder): folder is Many => (MANY as readonly Folder[]).includes(folder);

export interface Part {
  name: string;
  src: string;
  frames: string[];
  opacity?: number;
}

export type Parts = Record<Folder, Map<string, Part>>;

const IMAGE = /\.(png|jpe?g|webp)$/i;
const byName = new Intl.Collator("ja", { numeric: true }).compare;

const iniOpacity = (file: string): number | undefined => {
  if (!existsSync(file)) return undefined;
  const m = /^\s*opacity\s*=\s*([0-9.]+)\s*$/im.exec(readFileSync(file, "utf8"));
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
};

export const readParts = (root: string, src: string): Parts => {
  const base = src.replace(/\\/g, "/").replace(/\/+$/, "");
  const dir = join(root, base);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`portrait: there is no folder ${base} (it has the parts of the portrait: ${FOLDERS.join(", ")})`);
  }
  const parts = Object.fromEntries(FOLDERS.map((f) => [f, new Map<string, Part>()])) as Parts;
  for (const folder of FOLDERS) {
    const path = join(dir, folder);
    if (!existsSync(path) || !statSync(path).isDirectory()) continue;
    const frames = new Map<string, Map<number, string>>();
    for (const file of readdirSync(path)
      .filter((f) => IMAGE.test(f))
      .sort(byName)) {
      const [name, frame, ...rest] = file.replace(IMAGE, "").split(".");
      const src = `${base}/${folder}/${file}`;
      if (frame === undefined) parts[folder].set(name, { name, src, frames: [] });
      else if (rest.length === 0 && /^\d+$/.test(frame)) {
        const numbered = frames.get(name) ?? new Map<number, string>();
        frames.set(name, numbered);
        numbered.set(Number(frame), src);
      }
    }
    for (const [name, numbered] of frames) {
      const part = parts[folder].get(name);
      if (!part || !numbered.has(0)) continue;
      part.frames = [...numbered].sort(([a], [b]) => a - b).map(([, f]) => f);
    }
    if (folder === "髪") {
      for (const part of parts.髪.values()) part.opacity = iniOpacity(join(path, `${part.name}.ini`));
    }
  }
  if (FOLDERS.every((f) => parts[f].size === 0)) {
    throw new Error(`portrait: ${base} has no parts (images in its folders ${FOLDERS.join(", ")})`);
  }
  return parts;
};
