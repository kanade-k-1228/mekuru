import type { Layer, Psd } from "ag-psd";
import { readArtwork, rasterize } from "./portrait/psd-image.ts";
import { writePsdAssets } from "./portrait/psd-output.ts";
import { animated, assetName, selectable, validateManifest, type PortraitKind, type PsdManifest } from "./portrait/psd-schema.ts";

/** Validate the convention before rendering or writing anything. */
export function parsePortrait(psd: Psd) {
  const manifest: PsdManifest = { version: 2, width: psd.width, height: psd.height, layers: [] };
  const artwork: { src: string; layer: Layer; ancestors: Layer[] }[] = [];
  for (const layer of psd.children ?? []) {
    const match = /^(.*?) \[(fixed|toggle|select|blink|lip)\]$/.exec(layer.name ?? "");
    if (!match) throw new Error(`Expected name [fixed|toggle|select|blink|lip]: ${layer.name}`);
    const kind = match[2] as PortraitKind;
    const name = assetName(match[1], kind !== "fixed");
    if (!selectable(kind)) {
      const src = `${name}.png`;
      artwork.push({ src, layer, ancestors: [] });
      manifest.layers.push({ name, kind, initial: !layer.hidden, options: [{ name, frames: [src] }] });
      continue;
    }
    if (!layer.children?.length) throw new Error(`Empty group: ${name}`);
    const visible = layer.children.filter((c) => !c.hidden);
    if (visible.length > 1) throw new Error(`Multiple visible options: ${name}`);
    const options = layer.children.map((child) => {
      const option = assetName(child.name ?? "");
      if (animated(kind) && child.children) {
        const frames = [...child.children].sort((a, b) => Number(a.name) - Number(b.name));
        if (!frames.length || frames.some((f, i) => f.name !== String(i))) throw new Error(`Expected consecutive frames 0..N: ${name}/${option}`);
        return {
          name: option,
          frames: frames.map((frame, i) => {
            const src = `${name}/${option}/${i}.png`;
            artwork.push({ src, layer: frame, ancestors: [child, layer] });
            return src;
          }),
        };
      }
      const src = `${name}/${option}.png`;
      artwork.push({ src, layer: child, ancestors: [layer] });
      return { name: option, frames: [src] };
    });
    manifest.layers.push({ name, kind, options, initial: layer.hidden ? null : (visible[0]?.name ?? null) });
  }
  validateManifest(manifest);
  return { manifest, artwork };
}

/** PSD parsing and rasterization happen once, outside video rendering. */
export async function exportPsd(input: string, output: string): Promise<PsdManifest> {
  const psd = await readArtwork(input);
  const { manifest, artwork } = parsePortrait(psd);
  const raster = rasterize(psd);
  const images = new Map<string, Buffer>();
  for (const { src, layer, ancestors } of artwork) {
    const bytes = await raster.render(layer);
    for (const parent of ancestors) raster.apply(bytes, parent);
    images.set(src, await raster.png(bytes));
  }
  await writePsdAssets(output, manifest, images);
  return manifest;
}
