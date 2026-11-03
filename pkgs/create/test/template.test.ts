import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "../src/create.ts";

test("generated projects include selected engines, audio and upload commands", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-create-"));
  try {
    await create(dir, { engines: ["voicevox"], upload: ["youtube"] });
    const pkg = await Bun.file(join(dir, "package.json")).json();
    expect(pkg.devDependencies["@mekuru/audio"]).toBeDefined();
    expect(pkg.devDependencies["@mekuru/voicevox"]).toBeDefined();
    expect(pkg.devDependencies["@mekuru/voisona"]).toBeUndefined();
    expect(pkg.scripts["upload:youtube"]).toBe("mekuru-youtube");
    expect(await Bun.file(join(dir, "configs/youtube.yaml")).text()).toContain("privacy: private");
    const main = await Bun.file(join(dir, "src/main.tsx")).text();
    expect(main).not.toContain("#if");
    expect(main).toContain("<mekuru");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
