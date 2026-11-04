import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, rm, access, link, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePsdBuffer, type Layer } from "ag-psd";
import sharp from "sharp";
import { convertPsd, inspectPsd, type ConversionMap } from "../src/psd-convert.ts";
import { exportPsd } from "../src/psd.ts";
import { readArtwork } from "../src/portrait/psd-image.ts";

const pixel = (name: string, color: number[], more: Partial<Layer> = {}): Layer => ({
  name,
  left: 1,
  top: 0,
  right: 2,
  bottom: 1,
  imageData: { width: 1, height: 1, data: new Uint8ClampedArray(color) },
  ...more,
});
const source = (): Layer[] => [
  pixel("body", [255, 0, 0, 255]),
  {
    name: "!目",
    children: [
      { name: "*開き", children: [pixel("paint", [0, 255, 0, 255], { opacity: 0.5 }), pixel("unused", [255, 255, 255, 255], { hidden: true })] },
      pixel("*閉じ", [0, 0, 255, 255], { hidden: true }),
    ],
  },
];
const mapping = (): ConversionMap => ({
  version: 1,
  layers: [
    { name: "body", kind: "fixed", initial: true, source: ["body"] },
    {
      name: "eyes",
      kind: "blink",
      initial: "normal",
      options: [
        {
          name: "normal",
          frames: [
            ["!目", "*閉じ"],
            ["!目", "*開き"],
          ],
        },
      ],
    },
  ],
});
async function fixture(run: (input: string, output: string, save: (layers: Layer[]) => Promise<void>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-convert-"));
  const input = join(dir, "input.psd"),
    output = join(dir, "native.psd");
  const save = (children: Layer[]) => writeFile(input, writePsdBuffer({ width: 3, height: 2, children }));
  try {
    await save(source());
    await run(input, output, save);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("inspect exposes exact source paths and conversion preserves flattened pixels, frames and defaults", () =>
  fixture(async (input, output) => {
    const original = await readFile(input);
    const inspect = await inspectPsd(input);
    expect(inspect.layers.map((l) => l.path)).toContainEqual(["!目", "*開き", "paint"]);
    await convertPsd(input, output, mapping());
    expect(await readFile(input)).toEqual(original);
    const psd = await readArtwork(output);
    expect(psd.children?.map((l) => l.name)).toEqual(["body [fixed]", "eyes [blink]"]);
    const frames = psd.children?.[1].children?.[0].children;
    expect(frames?.map((l) => [l.name, !!l.hidden])).toEqual([
      ["0", true],
      ["1", false],
    ]);
    expect(frames?.every((l) => !l.children)).toBe(true);
    const out = `${output}.assets`;
    const m = await exportPsd(output, out);
    expect(m.version).toBe(2);
    expect(m.layers[1].initial).toBe("normal");
    const image = await sharp(join(out, "eyes/normal/1.png")).raw().toBuffer({ resolveWithObject: true });
    expect([image.info.width, image.info.height]).toEqual([3, 2]);
    expect([...image.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...image.data.subarray(4, 8)]).toEqual([0, 255, 0, 128]);
    const closed = await sharp(join(out, "eyes/normal/0.png")).raw().toBuffer();
    expect([...closed.subarray(4, 8)]).toEqual([0, 0, 255, 255]);
    const next = mapping();
    next.layers.reverse();
    await convertPsd(input, output, next);
    expect((await readArtwork(output)).children?.map((l) => l.name)).toEqual(["eyes [blink]", "body [fixed]"]);
  }));

test("conversion supports toggle/select/lip and an editor composite matching defaults", () =>
  fixture(async (input, output) => {
    await convertPsd(input, output, {
      version: 1,
      layers: [
        { name: "body", kind: "toggle", source: ["body"], initial: false },
        { name: "face", kind: "select", initial: null, options: [{ name: "one", frames: [["body"]] }] },
        {
          name: "mouth",
          kind: "lip",
          initial: "normal",
          options: [
            {
              name: "normal",
              frames: [
                ["!目", "*閉じ"],
                ["!目", "*開き"],
              ],
            },
          ],
        },
      ],
    });
    const m = await exportPsd(output, `${output}.assets`);
    expect(m.layers.map((l) => l.initial)).toEqual([false, null, "normal"]);
    const { readPsd } = await import("ag-psd");
    const psd = readPsd(await readFile(output), { useImageData: true });
    expect(Array.from(psd.imageData?.data.subarray(4, 8) ?? [])).toEqual([0, 0, 255, 255]);
  }));

test("missing/ambiguous paths, invalid mappings, parent effects and unsupported artwork fail before writing", () =>
  fixture(async (input, output, save) => {
    const bad = mapping();
    if (bad.layers[0].kind === "fixed") bad.layers[0].source = ["absent"];
    await expect(convertPsd(input, output, bad)).rejects.toThrow("Missing or ambiguous");
    await save([pixel("same", [0, 0, 0, 255]), pixel("same", [0, 0, 0, 255])]);
    const fixed = (source: string[]) => ({ version: 1, layers: [{ name: "body", kind: "fixed", initial: true, source }] });
    await expect(convertPsd(input, output, fixed(["same"]))).rejects.toThrow("ambiguous");
    await save([{ name: "parent", opacity: 0.5, children: [pixel("child", [0, 0, 0, 255])] }]);
    await expect(convertPsd(input, output, fixed(["parent", "child"]))).rejects.toThrow("parent effects");
    await save([pixel("body", [0, 0, 0, 255], { blendMode: "multiply" })]);
    await expect(convertPsd(input, output, fixed(["body"]))).rejects.toThrow("Unsupported PSD feature");
    await save(source());
    for (const map of [null, {}, { version: 1, layers: [] }, { version: 1, layers: [{ name: "x", kind: "select", initial: "missing", options: [] }] }])
      await expect(convertPsd(input, output, map)).rejects.toThrow();
    await expect(access(output)).rejects.toThrow();
    await convertPsd(input, output, mapping());
    const before = await readFile(output);
    await expect(convertPsd(input, output, bad)).rejects.toThrow();
    expect(await readFile(output)).toEqual(before);
  }));

test("source PSD is protected through direct, hardlink and symlink destinations", () =>
  fixture(async (input, output) => {
    const original = await readFile(input);
    await expect(convertPsd(input, input, mapping())).rejects.toThrow("source PSD");
    await link(input, output);
    await expect(convertPsd(input, output, mapping())).rejects.toThrow("source PSD");
    await rm(output);
    await symlink(input, output);
    await expect(convertPsd(input, output, mapping())).rejects.toThrow("source PSD");
    expect(await readFile(input)).toEqual(original);
  }));

test("CLI inspects, converts and rejects invalid arguments", () =>
  fixture(async (input, output) => {
    const cli = async (args: string[]) => {
      const proc = Bun.spawn([process.execPath, new URL("../src/mekuru-psd-convert.ts", import.meta.url).pathname, ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return { stdout, stderr, code };
    };
    const inspected = await cli([input, "--inspect"]);
    expect(inspected.code).toBe(0);
    expect(JSON.parse(inspected.stdout).layers[0].path).toEqual(["body"]);
    const config = `${output}.json`;
    await writeFile(config, JSON.stringify(mapping()));
    expect((await cli([input, "--map", config, "--out", output])).code).toBe(0);
    expect((await exportPsd(output, `${output}.assets`)).layers).toHaveLength(2);
    expect((await cli([input, "--unknown"])).code).toBe(1);
  }));
