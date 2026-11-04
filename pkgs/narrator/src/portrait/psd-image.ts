import { initializeCanvas, readPsd, type Layer, type Psd } from "ag-psd";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

export async function readArtwork(input: string): Promise<Psd> {
  initializeCanvas(
    () => {
      throw new Error("Canvas is not used");
    },
    (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }),
  );
  const psd = readPsd(await readFile(input), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  if ((psd.bitsPerChannel !== undefined && psd.bitsPerChannel !== 8) || (psd.colorMode !== undefined && psd.colorMode !== 3))
    throw new Error("PSD must be 8-bit RGB");
  return psd;
}

/** Shared raster subset for native export and one-time conversion. */
export function rasterize(psd: Psd) {
  const { width, height } = psd;
  const layers = psd.children ?? [];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("Invalid PSD dimensions");
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
  return { render, apply, png };
}
