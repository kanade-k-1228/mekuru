import { initializeCanvas, readPsd, type Layer } from "ag-psd";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { writePsdAssets } from "./portrait/psd-output.ts";
import { validateManifest, type PsdManifest } from "./portrait/psd-schema.ts";

const reserved = new Set(["id", "at", "len", "children", "source", "key", "ref", "__proto__", "constructor", "prototype"]);
function nameOf(layer: Layer, path: string, prop = false) {
  const name = layer.name ?? "";
  if (
    !name ||
    /[<>:"/\\|?*\p{Cc}]/u.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(name) ||
    name === "." ||
    name === ".."
  )
    throw new Error(`Invalid layer name: ${path}/${name}`);
  if (prop && (!/^[$_\p{ID_Start}](?:[$_\p{ID_Continue}]|\u200c|\u200d)*$/u.test(name) || reserved.has(name)))
    throw new Error(`Invalid property name: ${path}/${name}`);
  return name;
}
function unique(layers: Layer[], path: string) {
  const names = new Set<string>();
  for (const layer of layers) {
    const name = nameOf(layer, path);
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate layer name: ${path}/${name}`);
    names.add(name.toLowerCase());
  }
}

/** Export a compatible PSD; no PSD parsing is needed during video rendering. */
export async function exportPsd(input: string, output: string): Promise<PsdManifest> {
  initializeCanvas(
    () => {
      throw new Error("Canvas is not used");
    },
    (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }),
  );
  const psd = readPsd(await readFile(input), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  if ((psd.bitsPerChannel !== undefined && psd.bitsPerChannel !== 8) || (psd.colorMode !== undefined && psd.colorMode !== 3))
    throw new Error("PSD must be 8-bit RGB");
  const { width, height } = psd;
  const layers = psd.children ?? [];
  if (!layers.length) throw new Error("PSD has no layers");
  const manifest: PsdManifest = { version: 1, width, height, layers: [] };
  const images = new Map<string, Buffer>();
  const validate = (layer: Layer, path: string) => {
    const extra = layer as Layer & { adjustment?: unknown; placedLayer?: unknown; filterEffects?: unknown; fillOpacity?: number };
    if (
      layer.clipping ||
      layer.vectorMask ||
      layer.effects ||
      layer.text ||
      layer.vectorFill ||
      layer.vectorStroke ||
      extra.adjustment ||
      extra.placedLayer ||
      extra.filterEffects ||
      (extra.fillOpacity !== undefined && extra.fillOpacity !== 1) ||
      (layer.blendMode && layer.blendMode !== "normal" && !(layer.children && layer.blendMode === "pass through"))
    )
      throw new Error(`Unsupported PSD feature: ${path}; rasterize/merge this artwork first`);
    if (layer.children && layer.blendMode === "pass through" && ((layer.opacity ?? 1) !== 1 || (layer.mask && !layer.mask.disabled)))
      throw new Error(`Use normal group blending: ${path}`);
    if (layer.mask && !layer.mask.disabled && (!layer.mask.imageData || layer.mask.userMaskDensity !== undefined || layer.mask.userMaskFeather !== undefined))
      throw new Error(`Unsupported mask: ${path}`);
    for (const child of layer.children ?? []) validate(child, `${path}/${child.name}`);
  };
  for (const layer of layers) validate(layer, layer.name ?? "");
  const apply = (bytes: Buffer, layer: Layer) => {
    const mask = layer.mask?.disabled ? undefined : layer.mask;
    const pixels = mask?.imageData;
    const left = (mask?.left ?? 0) + (mask?.positionRelativeToLayer ? (layer.left ?? 0) : 0);
    const top = (mask?.top ?? 0) + (mask?.positionRelativeToLayer ? (layer.top ?? 0) : 0);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let coverage = 255;
        if (mask && pixels) {
          const mx = x - left,
            my = y - top;
          coverage = mx >= 0 && my >= 0 && mx < pixels.width && my < pixels.height ? pixels.data[(my * pixels.width + mx) * 4] : (mask.defaultColor ?? 0);
        }
        const a = (y * width + x) * 4 + 3;
        bytes[a] = Math.round((bytes[a] * (layer.opacity ?? 1) * coverage) / 255);
      }
    return bytes;
  };
  const png = (bytes: Buffer) =>
    sharp(bytes, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
  const render = async (layer: Layer): Promise<Buffer> => {
    let bytes = Buffer.alloc(width * height * 4);
    if (layer.children) {
      const children = await Promise.all(layer.children.filter((c) => !c.hidden).map(async (c) => ({ input: await png(await render(c)), left: 0, top: 0 })));
      if (children.length)
        bytes = Buffer.from(
          await sharp(bytes, { raw: { width, height, channels: 4 } })
            .composite(children)
            .raw()
            .toBuffer(),
        );
    } else {
      const data = layer.imageData;
      if (!data) throw new Error(`Layer has no raster image: ${layer.name}`);
      for (let y = 0; y < data.height; y++)
        for (let x = 0; x < data.width; x++) {
          const dx = x + (layer.left ?? 0),
            dy = y + (layer.top ?? 0);
          if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
          for (let c = 0; c < 4; c++) bytes[(dy * width + dx) * 4 + c] = data.data[(y * data.width + x) * 4 + c];
        }
    }
    return apply(bytes, layer);
  };
  // Preserve every nested source layer, including hidden variants. A child
  // group also has a sibling composite PNG used by the portrait renderer.
  const exportNested = async (group: Layer, path: string) => {
    const children = group.children ?? [];
    if (!children.length) throw new Error(`Empty group: ${path}`);
    unique(children, path);
    for (const child of children) {
      const childPath = `${path}/${nameOf(child, path)}`;
      images.set(`${childPath}.png`, await png(await render(child)));
      if (child.children) await exportNested(child, childPath);
    }
  };
  unique(layers, "");
  for (const layer of layers) {
    const name = nameOf(layer, "", !!layer.children);
    const children = layer.children;
    if (!children) {
      const src = `${name}.png`;
      images.set(src, await png(await render(layer)));
      manifest.layers.push({ name, kind: "fixed", initial: !layer.hidden, options: [{ name, src }] });
      continue;
    }
    if (!children.length) throw new Error(`Empty group: ${name}`);
    unique(children, name);
    const visible = children.filter((c) => !c.hidden);
    if (children.length > 1 && visible.length > 1) throw new Error(`Multiple visible options: ${name}`);
    const options = [];
    for (const child of children) {
      const childName = nameOf(child, name);
      const src = `${name}/${childName}.png`;
      images.set(src, await png(apply(await render(child), layer)));
      options.push({ name: childName, src });
      if (child.children) await exportNested(child, `${name}/${childName}`);
    }
    manifest.layers.push({
      name,
      kind: children.length === 1 ? "flag" : "select",
      options,
      initial: children.length === 1 ? false : layer.hidden ? null : (visible[0]?.name ?? null),
    });
  }
  manifest.files = [...images.keys()];
  const outputNames = new Set([...images.keys(), "portrait.json", "portrait.d.ts"].map((p) => p.toLowerCase()));
  for (const path of outputNames) {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++)
      if (outputNames.has(segments.slice(0, i).join("/"))) throw new Error(`PSD file/directory name collision: ${path}`);
  }
  validateManifest(manifest);
  await writePsdAssets(output, manifest, images);
  return manifest;
}
