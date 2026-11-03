import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create, VERSION } from "../src/create.ts";

test("generated projects include selected engines, audio and upload commands", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-create-"));
  try {
    await create(dir, { mekuru: "^0.3.0", engines: ["voicevox"], upload: ["youtube"] });
    const pkg = await Bun.file(join(dir, "package.json")).json();
    expect(pkg.devDependencies["@mekuru/types"]).toBe("^0.3.0");
    expect(pkg.devDependencies["@mekuru/core"]).toBe(`^${VERSION}`);
    expect(pkg.devDependencies["@mekuru/compiler"]).toBeUndefined();
    const tsconfig = await Bun.file(join(dir, "tsconfig.json")).json();
    expect(tsconfig.compilerOptions.jsxImportSource).toBe("@mekuru/types");
    expect(pkg.devDependencies["@mekuru/audio"]).toBeDefined();
    expect(pkg.devDependencies["@mekuru/voicevox"]).toBeDefined();
    expect(pkg.devDependencies["@mekuru/voisona"]).toBeUndefined();
    expect(pkg.scripts["upload:youtube"]).toBe("mekuru-youtube");
    expect(await Bun.file(join(dir, "configs/youtube.yaml")).text()).toContain("privacy: private");
    const main = await Bun.file(join(dir, "src/main.tsx")).text();
    expect(main).toContain('from "@mekuru/types"');
    expect(main).not.toContain("#if");
    expect(main).toContain("<mekuru");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
