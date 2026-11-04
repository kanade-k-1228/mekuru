import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create, VERSION } from "../src/create.ts";

test("generated projects include the selected engines and upload commands", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-create-"));
  try {
    await create(dir, { engines: ["voicevox", "aivisspeech"], upload: ["youtube", "niconico"] });
    const pkg = await Bun.file(join(dir, "package.json")).json();
    expect(Object.keys(pkg.devDependencies)).toEqual([
      "@mekuru/audio",
      "@mekuru/core",
      "@mekuru/narrator",
      "@mekuru/types",
      "@mekuru/upload",
      "@mekuru/voicevox",
      "@types/bun",
      "typescript",
    ]);
    expect(pkg.devDependencies["@mekuru/types"]).toBe(`^${VERSION}`);
    expect(pkg.devDependencies["@mekuru/core"]).toBe(`^${VERSION}`);
    expect(pkg.devDependencies["@mekuru/upload"]).toBe(`^${VERSION}`);
    expect(pkg.scripts["upload:youtube"]).toBe("mekuru-youtube");
    expect(pkg.scripts["upload:niconico"]).toBe("mekuru-niconico");
    expect(await Bun.file(join(dir, "configs/youtube.yaml")).text()).toContain("privacy: private");
    const tsconfig = await Bun.file(join(dir, "tsconfig.json")).json();
    expect(tsconfig.compilerOptions.jsxImportSource).toBe("@mekuru/types");
    const readme = await Bun.file(join(dir, "README.md")).text();
    expect(readme).toStartWith(`# ${pkg.name}\n`);
    expect(readme).not.toContain("#if");
    expect(readme).toContain("- VOICEVOX:");
    expect(readme).toContain("- AivisSpeech:");
    expect(readme).not.toContain("VoiSona");
    expect(readme).toContain("upload:niconico");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
