import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePsdBuffer, type Layer } from "ag-psd";
import sharp from "sharp";
import { toXml } from "@mekuru/types";
import { psdPortrait } from "../src/index.tsx";
import { exportPsd } from "../src/psd";

const pixel = (name: string, rgba: number[], more: Partial<Layer> = {}): Layer => ({
  name,
  top: 0,
  left: 0,
  bottom: 1,
  right: 1,
  imageData: { width: 1, height: 1, data: new Uint8ClampedArray(rgba) },
  ...more,
});
const layers = (): Layer[] => [
  pixel("body", [255, 0, 0, 255]),
  {
    name: "face",
    children: [
      pixel("smile", [0, 255, 0, 255]),
      { name: "angry", hidden: true, children: [pixel("paint", [0, 0, 255, 255]), pixel("hidden", [255, 255, 255, 255], { hidden: true })] },
    ],
  },
  { name: "glass", children: [pixel("glasses", [255, 255, 255, 255])] },
];
async function fixture(run: (input: string, out: string, save: (children: Layer[]) => Promise<void>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-psd-"));
  const input = join(dir, "test.psd"),
    out = join(dir, "assets");
  const save = async (children: Layer[]) => {
    await writeFile(input, writePsdBuffer({ width: 2, height: 2, children }));
  };
  try {
    await save(layers());
    await run(input, out, save);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
interface Props {
  face?: "smile" | "angry";
  glass?: boolean;
}

test("PSD export preserves options, order, defaults, types and nested artwork", () =>
  fixture(async (input, out) => {
    const m = await exportPsd(input, out);
    expect(m.layers.map((l) => [l.name, l.kind, l.initial])).toEqual([
      ["body", "fixed", true],
      ["face", "select", "smile"],
      ["glass", "flag", false],
    ]);
    expect(await readFile(join(out, "portrait.d.ts"), "utf8")).toContain('"face"?: "smile" | "angry"');
    expect(await readFile(join(out, "portrait.d.ts"), "utf8")).toContain('"glass"?: boolean');
    const image = await sharp(join(out, "face/angry.png")).raw().toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(2);
    expect(m.files).toContain("face/angry/paint.png");
    expect(m.files).toContain("face/angry/hidden.png");
    const hidden = await sharp(join(out, "face/angry/hidden.png")).raw().toBuffer();
    expect([...hidden.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...image.data.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect(image.data[7]).toBe(0);
    const actor = psdPortrait<Props>({ src: out });
    const xml = await toXml(
      <mekuru>
        <actor.Stand face="angry" glass />
      </mekuru>,
    );
    expect(xml.indexOf("body.png")).toBeLessThan(xml.indexOf("face/angry.png"));
    expect(xml).toContain("glass/glasses.png");
    const reset = await toXml(
      <mekuru>
        <actor.Stand />
      </mekuru>,
    );
    expect(reset).toContain("face/smile.png");
    expect(reset).not.toContain("glass/");
    const talk = await toXml(
      <mekuru>
        <actor.Talk face="smile" source={{ status: "draft", len: 30 }} />
      </mekuru>,
    );
    expect(talk).not.toContain("<audio");
    expect(talk).toContain('len="30"');
    expect(talk).toContain("face/smile.png");
    expect(() => actor.Stand({ face: "missing" } as unknown as Props)).toThrow("unknown option");
    expect(() => actor.Stand({ glass: "yes" } as unknown as Props)).toThrow("expected boolean");
    expect(() => actor.Stand({ bogus: true } as Props)).toThrow("Unknown PSD property");
  }));

test("masks, opacity, offsets and hidden defaults", () =>
  fixture(async (input, out, save) => {
    await save([
      pixel("base", [255, 0, 0, 255], {
        left: 1,
        right: 2,
        opacity: 0.5,
        mask: { top: 0, left: 1, bottom: 1, right: 2, defaultColor: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) } },
      }),
      { name: "face", hidden: true, children: [pixel("a", [0, 255, 0, 255]), pixel("b", [0, 0, 255, 255], { hidden: true })] },
    ]);
    const m = await exportPsd(input, out);
    expect(m.layers[1].initial).toBeNull();
    const raw = await sharp(join(out, "base.png")).raw().toBuffer();
    expect(raw[3]).toBe(0);
    expect(raw[7]).toBeCloseTo(64, -1);
  }));

test("re-export removes obsolete generated files but preserves unrelated files", () =>
  fixture(async (input, out, save) => {
    await exportPsd(input, out);
    await writeFile(join(out, "notes.txt"), "keep");
    await save([pixel("body", [0, 255, 0, 255])]);
    await exportPsd(input, out);
    await expect(access(join(out, "face/smile.png"))).rejects.toThrow();
    await expect(access(join(out, "face/angry"))).rejects.toThrow();
    expect(await readFile(join(out, "notes.txt"), "utf8")).toBe("keep");
  }));

test("invalid structures and unsupported artwork fail before writing", () =>
  fixture(async (input, out, save) => {
    for (const [children, message] of [
      [[{ name: "face", children: [pixel("a", [0, 0, 0, 255]), pixel("b", [0, 0, 0, 255])] }], "Multiple visible"],
      [[{ name: "face", children: [] }], "Empty group"],
      [[{ name: "children", children: [pixel("a", [0, 0, 0, 255])] }], "Invalid property"],
      [[pixel("../bad", [0, 0, 0, 255])], "Invalid layer"],
      [[pixel("same", [0, 0, 0, 255]), pixel("Same", [0, 0, 0, 255])], "Duplicate layer"],
      [[pixel("effect", [0, 0, 0, 255], { blendMode: "multiply" })], "Unsupported PSD feature"],
    ] as [Layer[], string][]) {
      await save(children);
      await expect(exportPsd(input, out)).rejects.toThrow(message);
    }
  }));

// Compile-time API contract, without performing asset IO.
function typing(actor: ReturnType<typeof psdPortrait<Props>>) {
  actor.Stand({ face: "smile", glass: true });
  // @ts-expect-error unknown option
  actor.Stand({ face: "sad" });
  // @ts-expect-error flags are booleans
  actor.Stand({ glass: "yes" });
}
void typing;

test("CLI generates usable TypeScript definitions", () =>
  fixture(async (input, out) => {
    const cli = Bun.spawn([process.execPath, new URL("../src/mekuru-psd.ts", import.meta.url).pathname, input, "--out", out], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const error = await new Response(cli.stderr).text();
    expect(await cli.exited, error).toBe(0);
    const check = join(out, "check.ts");
    await writeFile(
      check,
      `import type { LayerProps } from "./portrait";\nconst valid: LayerProps = { face: "smile", glass: true };\n// @ts-expect-error invalid option\nconst badFace: LayerProps = { face: "missing" };\n// @ts-expect-error invalid flag\nconst badFlag: LayerProps = { glass: "yes" };\n// @ts-expect-error fixed layers are not props\nconst badBase: LayerProps = { body: true };\nvoid [valid, badFace, badFlag, badBase];\n`,
    );
    const compiler = Bun.spawn(
      [process.execPath, new URL("./bin/tsc", import.meta.resolve("typescript/package.json")).pathname, "--noEmit", "--strict", "--skipLibCheck", check],
      { cwd: out, stdout: "pipe", stderr: "pipe" },
    );
    const result = await new Response(compiler.stdout).text();
    expect(await compiler.exited, result).toBe(0);
  }));

test("re-export migrates the old parts/fixed layout and keeps unrelated files", () =>
  fixture(async (input, out) => {
    const m = await exportPsd(input, out);
    const { mkdir, rename } = await import("node:fs/promises");
    for (const layer of m.layers)
      for (const option of layer.options) {
        const old = `${layer.kind === "fixed" ? "fixed" : "parts"}/${option.src}`;
        await mkdir(join(out, old, ".."), { recursive: true });
        await rename(join(out, option.src), join(out, old));
        option.src = old;
      }
    delete m.files;
    await writeFile(join(out, "portrait.json"), JSON.stringify(m));
    await writeFile(join(out, "parts", "notes.txt"), "keep");
    await exportPsd(input, out);
    await access(join(out, "body.png"));
    await access(join(out, "face/smile.png"));
    await expect(access(join(out, "fixed"))).rejects.toThrow();
    await expect(access(join(out, "parts/face"))).rejects.toThrow();
    expect(await readFile(join(out, "parts/notes.txt"), "utf8")).toBe("keep");
  }));

test("asset paths reject escapes and nested filename collisions", async () => {
  const { safeAssetPath } = await import("../src/portrait/psd-schema.ts");
  for (const path of ["/body.png", "../body.png", "face/../body.png", "C:/body.png", "face\\body.png"]) expect(safeAssetPath(path)).toBe(false);
  expect(safeAssetPath("face/smile.png")).toBe(true);
  await fixture(async (input, out, save) => {
    await save([{ name: "face", children: [pixel("body", [0, 0, 0, 255]), { name: "body.png", hidden: true, children: [pixel("part", [0, 0, 0, 255])] }] }]);
    await expect(exportPsd(input, out)).rejects.toThrow("collision");
  });
});
