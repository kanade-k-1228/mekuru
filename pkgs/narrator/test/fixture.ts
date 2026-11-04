import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePsdBuffer, type Layer } from "ag-psd";

/** A one-pixel raster layer at the canvas origin, unless `more` moves it. */
export const pixel = (name: string, rgba: number[], more: Partial<Layer> = {}): Layer => ({
  name,
  top: 0,
  left: 0,
  bottom: 1,
  right: 1,
  imageData: { width: 1, height: 1, data: new Uint8ClampedArray(rgba) },
  ...more,
});

/** Runs each test on a fresh `input.psd` of these layers; `save` replaces them, and `output` is free for results. */
export const psdFixture =
  (width: number, height: number, layers: () => Layer[]) =>
  async (run: (input: string, output: string, save: (children: Layer[]) => Promise<void>) => Promise<void>) => {
    const dir = await mkdtemp(join(tmpdir(), "mekuru-psd-"));
    const input = join(dir, "input.psd");
    const save = (children: Layer[]) => writeFile(input, writePsdBuffer({ width, height, children }));
    try {
      await save(layers());
      await run(input, join(dir, "output"), save);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
