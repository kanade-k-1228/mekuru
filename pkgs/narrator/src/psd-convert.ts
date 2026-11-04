import { writePsdBuffer, type Layer, type Psd } from "ag-psd";
import { mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readArtwork, rasterize } from "./portrait/psd-image.ts";
import { animated } from "./portrait/psd-schema.ts";
import { parsePortrait } from "./psd.ts";

export type LayerPath = string[];
export type ConversionLayer =
  | { [K in "fixed" | "toggle"]: { name: string; kind: K; initial: boolean; source: LayerPath } }["fixed" | "toggle"]
  | { [K in "select" | "blink" | "lip"]: { name: string; kind: K; initial: string | null; options: { name: string; frames: LayerPath[] }[] } }[
      | "select"
      | "blink"
      | "lip"];
/** Layers are listed back to front; frames are listed closed to open. */
export interface ConversionMap {
  version: 1;
  layers: ConversionLayer[];
}

export async function inspectPsd(input: string) {
  const psd = await readArtwork(input);
  const layers: { path: LayerPath; visible: boolean; group: boolean; blendMode: string; opacity: number }[] = [];
  const visit = (children: Layer[], parent: LayerPath) => {
    for (const layer of children) {
      const path = [...parent, layer.name ?? ""];
      layers.push({ path, visible: !layer.hidden, group: !!layer.children, blendMode: layer.blendMode ?? "normal", opacity: layer.opacity ?? 1 });
      visit(layer.children ?? [], path);
    }
  };
  visit(psd.children ?? [], []);
  return { width: psd.width, height: psd.height, order: "back-to-front", layers };
}

/** Explicit mapping is the only compatibility boundary; output is an ordinary native PSD. */
export async function convertPsd(input: string, output: string, mapping: unknown): Promise<void> {
  const sourcePath = await realpath(input);
  const targetPath = resolve(output);
  const sourceStat = await stat(sourcePath);
  const targetStat = await stat(targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (sourcePath === targetPath || (targetStat?.dev === sourceStat.dev && targetStat?.ino === sourceStat.ino))
    throw new Error("Conversion must not overwrite the source PSD");
  const map = mapping as ConversionMap;
  if (map?.version !== 1 || !Array.isArray(map.layers) || !map.layers.length) throw new Error("Expected conversion map version 1 with layers");
  const psd = await readArtwork(input);
  const find = (path: LayerPath): Layer => {
    if (!Array.isArray(path) || !path.length || path.some((p) => typeof p !== "string" || !p)) throw new Error("Expected a non-empty layer path array");
    let children = psd.children ?? [];
    let found: Layer | undefined;
    for (let i = 0; i < path.length; i++) {
      const matches = children.filter((l) => l.name === path[i]);
      if (matches.length !== 1) throw new Error(`Missing or ambiguous layer: ${JSON.stringify(path.slice(0, i + 1))}`);
      found = matches[0];
      if (
        i < path.length - 1 &&
        ((found.opacity ?? 1) !== 1 || (found.mask && !found.mask.disabled) || (found.blendMode && !["normal", "pass through"].includes(found.blendMode)))
      )
        throw new Error(`Cannot detach from parent effects: ${JSON.stringify(path.slice(0, i + 1))}; merge inside this parent first`);
      children = found.children ?? [];
    }
    return found as Layer;
  };
  // Resolve all paths and validate the target convention before rasterizing.
  const copies: { source: Layer; target: Layer }[] = [];
  const copy = (path: LayerPath, name: string, hidden: boolean): Layer => {
    const target: Layer = { name, hidden, top: 0, left: 0, bottom: psd.height, right: psd.width };
    copies.push({ source: find(path), target });
    return target;
  };
  const children = map.layers.map((part) => {
    if (!part || typeof part.name !== "string" || !["fixed", "toggle", "select", "blink", "lip"].includes(part.kind))
      throw new Error("Invalid conversion layer");
    const name = `${part.name} [${part.kind}]`;
    if (part.kind === "fixed" || part.kind === "toggle") {
      if (typeof part.initial !== "boolean") throw new Error(`Expected boolean initial: ${name}`);
      return copy(part.source, name, !part.initial);
    }
    if (!Array.isArray(part.options) || !part.options.length || (part.initial !== null && !part.options.some((o) => o?.name === part.initial)))
      throw new Error(`Invalid options or initial: ${part.name}`);
    return {
      name,
      hidden: part.initial === null,
      children: part.options.map((option) => {
        if (
          !option ||
          typeof option.name !== "string" ||
          !Array.isArray(option.frames) ||
          !option.frames.length ||
          (!animated(part.kind) && option.frames.length !== 1)
        )
          throw new Error(`Invalid frames: ${part.name}`);
        const hidden = option.name !== part.initial;
        if (option.frames.length === 1) return copy(option.frames[0], option.name, hidden);
        return {
          name: option.name,
          hidden,
          children: option.frames.map((path, i) => copy(path, String(i), i !== (part.kind === "blink" ? option.frames.length - 1 : 0))),
        };
      }),
    };
  });
  const converted: Psd = { width: psd.width, height: psd.height, children };
  parsePortrait(converted);
  const raster = rasterize(psd);
  for (const { source, target } of copies) {
    target.imageData = { width: psd.width, height: psd.height, data: new Uint8ClampedArray(await raster.render(source)) };
  }
  // Make editor previews match the selected defaults, including closed mouths/open eyes.
  const composite = await rasterize(converted).render({ children });
  converted.imageData = { width: psd.width, height: psd.height, data: new Uint8ClampedArray(composite) };
  const bytes = writePsdBuffer(converted);
  await mkdir(dirname(targetPath), { recursive: true });
  const temp = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temp, bytes, { flag: "wx" });
    await rename(temp, targetPath);
  } finally {
    await rm(temp, { force: true });
  }
}
