import { expect, test } from "bun:test";
import { writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { Layer } from "ag-psd";
import sharp from "sharp";
import { toXml, type Node } from "@mekuru/tsx";
import { wav } from "../../tsx/test/fixture.ts";
import { portrait } from "../src/index.tsx";
import { exportPsd } from "../src/psd.ts";
import { pixel, psdFixture } from "./fixture.ts";

const render = (children: Node) => toXml(<mekuru>{children}</mekuru>);

const layers = (): Layer[] => [
  pixel("body [fixed]", [255, 0, 0, 255]),
  {
    name: "face [select]",
    children: [
      pixel("smile", [0, 255, 0, 255]),
      { name: "angry", hidden: true, children: [pixel("paint", [0, 0, 255, 255]), pixel("hidden", [255, 255, 255, 255], { hidden: true })] },
    ],
  },
  { name: "glass [toggle]", hidden: true, children: [pixel("glasses", [255, 255, 255, 255])] },
];
const fixture = psdFixture(2, 2, layers);
interface Props {
  face?: "smile" | "angry" | null;
  glass?: boolean;
}

test("PSD export preserves options, order, defaults and types, flattening nested artwork", () =>
  fixture(async (input, out) => {
    const m = await exportPsd(input, out);
    expect(m.layers.map((l) => [l.name, l.kind, l.initial])).toEqual([
      ["body", "fixed", true],
      ["face", "select", "smile"],
      ["glass", "toggle", false],
    ]);
    expect(await readFile(join(out, "portrait.d.ts"), "utf8")).toContain('"face"?: "smile" | "angry"');
    expect(await readFile(join(out, "portrait.d.ts"), "utf8")).toContain('"glass"?: boolean');
    const image = await sharp(join(out, "face/angry.png")).raw().toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(2);
    await expect(access(join(out, "face/angry/paint.png"))).rejects.toThrow();
    await expect(access(join(out, "face/angry/hidden.png"))).rejects.toThrow();
    expect([...image.data.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect(image.data[7]).toBe(0);
    const actor = portrait<Props>({ src: out });
    const xml = await render(<actor.Stand face="angry" glass />);
    expect(xml.indexOf("body.png")).toBeLessThan(xml.indexOf("face/angry.png"));
    expect(xml).toContain("glass.png");
    const reset = await render(<actor.Stand />);
    expect(reset).toContain("face/smile.png");
    expect(reset).not.toContain("glass.png");
    const talk = await render(<actor.Talk face="smile" source={{ status: "draft", len: 30 }} />);
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
      pixel("base [fixed]", [255, 0, 0, 255], {
        left: 1,
        right: 2,
        opacity: 0.5,
        mask: { top: 0, left: 1, bottom: 1, right: 2, defaultColor: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) } },
      }),
      { name: "face [select]", hidden: true, children: [pixel("a", [0, 255, 0, 255]), pixel("b", [0, 0, 255, 255], { hidden: true })] },
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
    await save([pixel("body [fixed]", [0, 255, 0, 255])]);
    await exportPsd(input, out);
    await expect(access(join(out, "face/smile.png"))).rejects.toThrow();
    await expect(access(join(out, "face/angry"))).rejects.toThrow();
    expect(await readFile(join(out, "notes.txt"), "utf8")).toBe("keep");
  }));

test("invalid structures and unsupported artwork fail before writing", () =>
  fixture(async (input, out, save) => {
    for (const [children, message] of [
      [[{ name: "face [select]", children: [pixel("a", [0, 0, 0, 255]), pixel("b", [0, 0, 0, 255])] }], "Multiple visible"],
      [[{ name: "face [select]", children: [] }], "Empty group"],
      [[{ name: "children [select]", children: [pixel("a", [0, 0, 0, 255])] }], "Invalid property"],
      [[pixel("../bad [fixed]", [0, 0, 0, 255])], "Invalid layer"],
      [[pixel("same [fixed]", [0, 0, 0, 255]), pixel("Same [fixed]", [0, 0, 0, 255])], "duplicate PSD"],
      [[pixel("effect [fixed]", [0, 0, 0, 255], { blendMode: "multiply" })], "Unsupported PSD feature"],
    ] as [Layer[], string][]) {
      await save(children);
      await expect(exportPsd(input, out)).rejects.toThrow(message);
    }
  }));

// Compile-time API contract, without performing asset IO.
function typing(actor: ReturnType<typeof portrait<Props>>) {
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

test("asset paths reject escapes and nested filename collisions", async () => {
  const { safeAssetPath } = await import("../src/portrait/psd-schema.ts");
  for (const path of ["/body.png", "../body.png", "face/../body.png", "C:/body.png", "face\\body.png"]) expect(safeAssetPath(path)).toBe(false);
  expect(safeAssetPath("face/smile.png")).toBe(true);
  await fixture(async (input, out, save) => {
    await save([
      { name: "face [blink]", children: [pixel("body", [0, 0, 0, 255]), { name: "body.png", hidden: true, children: [pixel("0", [0, 0, 0, 255])] }] },
    ]);
    await expect(exportPsd(input, out)).rejects.toThrow("collision");
  });
});

test("explicit kinds do not change when options are added; null hides selections and calls reset", () =>
  fixture(async (input, out, save) => {
    await save([
      { name: "服 [select]", children: [pixel("普段着", [0, 0, 0, 255])] },
      { name: "glass [toggle]", children: [pixel("left", [0, 0, 0, 255]), pixel("right", [0, 0, 0, 255])] },
    ]);
    const m = await exportPsd(input, out);
    expect(m.layers.map((l) => [l.kind, l.initial])).toEqual([
      ["select", "普段着"],
      ["toggle", true],
    ]);
    const actor = portrait<{ 服?: "普段着" | null; glass?: boolean }>({ src: out });
    const hidden = await render(<actor.Stand 服={null} glass={false} />);
    expect(hidden).not.toContain("<image");
    const reset = await render(<actor.Stand />);
    expect(reset).toContain("服/普段着.png");
    expect(reset).toContain("glass.png");
    expect(await readFile(join(out, "portrait.d.ts"), "utf8")).toContain('"服"?: "普段着" | null');
    await save([pixel("missing annotation", [0, 0, 0, 255])]);
    await expect(exportPsd(input, out)).rejects.toThrow("Expected name");
  }));

test("animation frames are ordered numerically, static alternatives stay static, and gaps fail before writing", () =>
  fixture(async (input, out, save) => {
    await save([
      {
        name: "eyes [blink]",
        children: [
          {
            name: "normal",
            children: [pixel("2", [0, 0, 255, 255]), pixel("0", [255, 0, 0, 255], { hidden: true }), pixel("1", [0, 255, 0, 255], { hidden: true })],
          },
          pixel("smile", [255, 255, 255, 255], { hidden: true }),
        ],
      },
    ]);
    const m = await exportPsd(input, out);
    expect(m.layers[0].options[0].frames).toEqual(["eyes/normal/0.png", "eyes/normal/1.png", "eyes/normal/2.png"]);
    const actor = portrait<{ eyes?: "normal" | "smile" }>({ src: out, blink: 6 });
    const xml = () =>
      toXml(
        <mekuru fps={30}>
          <actor.Stand len={120} />
        </mekuru>,
      );
    expect(await xml()).toBe(await xml());
    const shown = await xml();
    expect(shown).toContain("eyes/normal/0.png");
    expect(shown).toContain("eyes/normal/2.png");
    const staticXml = await render(<actor.Stand eyes="smile" len={120} />);
    expect(staticXml.match(/<image /g)).toHaveLength(1);
    const before = await readFile(join(out, "portrait.json"), "utf8");
    await save([{ name: "eyes [blink]", children: [{ name: "normal", children: [pixel("0", [0, 0, 0, 255]), pixel("2", [0, 0, 0, 255])] }] }]);
    await expect(exportPsd(input, out)).rejects.toThrow("consecutive frames");
    expect(await readFile(join(out, "portrait.json"), "utf8")).toBe(before);
  }));

test("speech animates any lip group, closes during silence/draft/tail, and preserves blink and slot replacement", () =>
  fixture(async (input, out, save) => {
    await save([
      { name: "くち [lip]", children: [{ name: "normal", children: [pixel("0", [255, 0, 0, 255]), pixel("1", [0, 0, 255, 255], { hidden: true })] }] },
      { name: "eyes [blink]", children: [{ name: "normal", children: [pixel("0", [255, 0, 0, 255], { hidden: true }), pixel("1", [0, 0, 255, 255])] }] },
    ]);
    await exportPsd(input, out);
    // Half a second of silence, then half a second of speech.
    const src = join(out, "speech.wav");
    await writeFile(src, wav([...new Array(2400).fill(0), ...new Array(2400).fill(12000)], 4800));
    const actor = portrait({ src: out, slot: "speaker", blink: 6 });
    const draft = await render(<actor.Talk source={{ status: "draft", len: 60 }} />);
    expect(draft).toContain("くち/normal/0.png");
    expect(draft).not.toContain("くち/normal/1.png");
    expect(draft).toContain("eyes/normal/0.png");
    const ready = await toXml(
      <mekuru>
        <stack>
          <actor.Stand />
          <actor.Talk source={{ status: "ready", src, len: 60 }} />
        </stack>
      </mekuru>,
    );
    expect(ready).toContain("くち/normal/1.png");
    expect(ready.match(/slot="speaker"/g)).toHaveLength(2);
    const spoken = await render(<actor.Talk source={{ status: "ready", src, len: 60 }} />);
    const mouth = [...spoken.matchAll(/<dur len="(\d+)">\s*<image[^>]*src="[^"]*くち\/normal\/(\d).png"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(mouth[0][1]).toBe(0);
    expect(mouth.at(-1)?.[1]).toBe(0);
    expect(mouth.reduce((sum, [len]) => sum + len, 0)).toBe(60);
    expect(mouth.some(([, shape]) => shape === 1)).toBe(true);
    await writeFile(src, wav(4800, 4800));
    const silence = await render(<actor.Talk source={{ status: "ready", src, len: 60 }} />);
    expect(silence).not.toContain("くち/normal/1.png");
    const still = portrait({ src: out, blink: false });
    const stand = await render(<still.Stand />);
    expect(stand).toContain("eyes/normal/1.png");
    expect(stand).not.toContain("eyes/normal/0.png");
  }));
