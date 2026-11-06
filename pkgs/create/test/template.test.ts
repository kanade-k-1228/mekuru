import { expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create, VERSION } from "../src/create.ts";
import { wav } from "../../audio/test/fixture.ts";

const runProject = async (dir: string, env: Record<string, string | undefined> = {}) => {
  // Use the workspace packages, including the unreleased version, in the generated project.
  await symlink(join(import.meta.dir, "../../../example/node_modules"), join(dir, "node_modules"), "junction");
  for (const cmd of [
    [join(import.meta.dir, "../../../node_modules/.bin/tsc"), "-p", dir],
    [process.execPath, "src/main.tsx"],
  ]) {
    const child = Bun.spawn(cmd, { cwd: dir, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe", timeout: 5000 });
    const [code, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(code, output + error).toBe(0);
  }
  return Bun.file(join(dir, ".mekuru/main.xml")).text();
};

test("sample projects include speech and the selected upload commands", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-create-"));
  try {
    await create(dir, { template: "sample", upload: ["youtube", "niconico"] });
    const pkg = await Bun.file(join(dir, "package.json")).json();
    expect(Object.keys(pkg.devDependencies)).toEqual([
      "@mekuru/audio",
      "@mekuru/core",
      "@mekuru/narrator",
      "@mekuru/speech",
      "@mekuru/tsx",
      "@mekuru/upload",
      "@types/bun",
      "typescript",
    ]);
    expect(pkg.devDependencies["@mekuru/tsx"]).toBe(`^${VERSION}`);
    expect(pkg.devDependencies["@mekuru/core"]).toBe(`^${VERSION}`);
    expect(pkg.devDependencies["@mekuru/speech"]).toBe(`^${VERSION}`);
    expect(pkg.devDependencies["@mekuru/upload"]).toBe(`^${VERSION}`);
    expect(pkg.scripts["upload:youtube"]).toBe("mekuru-youtube");
    expect(pkg.scripts["upload:niconico"]).toBe("mekuru-niconico");
    expect(await Bun.file(join(dir, "configs/youtube.yaml")).text()).toContain("privacy: private");
    const tsconfig = await Bun.file(join(dir, "tsconfig.json")).json();
    expect(tsconfig.compilerOptions.jsxImportSource).toBe("@mekuru/tsx");
    const readme = await Bun.file(join(dir, "README.md")).text();
    expect(readme).toStartWith(`# ${pkg.name}\n`);
    expect(readme).not.toContain("#if");
    expect(readme).toContain("- irodoru:");
    expect(readme).toContain("upload:niconico");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the default project runs its irodoru sample without a registered voice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-create-"));
  const spoken: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/" && request.method === "POST") {
        const body = (await request.json()) as { model?: string; seed: number; voice?: string; caption: string; text: string };
        expect(body.model).toBeUndefined();
        expect(body.seed).toBe(1);
        expect(body.voice).toBeUndefined();
        expect(body.caption).toBeTruthy();
        spoken.push(body.text);
        return new Response(wav(4800));
      }
      return new Response("unexpected request", { status: 404 });
    },
  });
  try {
    await create(dir);
    const pkg = await Bun.file(join(dir, "package.json")).json();
    expect(pkg.devDependencies["@mekuru/speech"]).toBe(`^${VERSION}`);
    expect(pkg.scripts.irodoru).toBe("docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/kanade-k-1228/irodoru:latest-mf");
    expect(pkg.scripts.voicevox).toBe("docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest");
    expect(pkg.devDependencies["@mekuru/upload"]).toBeUndefined();
    expect(Object.keys(pkg.scripts)).not.toContain("upload:youtube");
    const readme = await Bun.file(join(dir, "README.md")).text();
    expect(readme).toContain("MEKURU_IRODORU_URL");
    expect(readme).toContain("bun run irodoru");
    expect(readme).toContain("bun run voicevox");
    expect(readme).not.toContain("空の台本");
    expect(readme).not.toContain("#if");
    expect(readme).not.toContain("upload:youtube");
    const xml = await runProject(dir, { MEKURU_IRODORU_URL: server.url.href });
    expect(spoken.toSorted()).toEqual(["こんにちは。", "タイトルは、セリフが終わるまで表示されます。"].toSorted());
    expect(xml).toContain('text="はじめての動画"');
    expect(xml.match(/<audio src=/g)).toHaveLength(2);
    expect(xml).not.toContain('draft="true"');
  } finally {
    server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});

test("empty projects run without speech packages or a server and still support uploads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-create-"));
  try {
    await create(dir, { template: "empty", upload: ["youtube"] });
    const pkg = await Bun.file(join(dir, "package.json")).json();
    expect(Object.keys(pkg.devDependencies)).toEqual(["@mekuru/core", "@mekuru/tsx", "@mekuru/upload", "@types/bun", "typescript"]);
    expect(pkg.scripts.voicevox).toBeUndefined();
    expect(pkg.scripts.irodoru).toBeUndefined();
    expect(pkg.scripts["upload:youtube"]).toBe("mekuru-youtube");
    expect(await Bun.file(join(dir, "src/parts.tsx")).exists()).toBe(false);
    expect(await Bun.file(join(dir, ".gitignore")).exists()).toBe(true);
    const readme = await Bun.file(join(dir, "README.md")).text();
    expect(readme).toContain("空の台本");
    expect(readme).toContain("upload:youtube");
    expect(readme).not.toContain("VOICEVOX");
    expect(readme).not.toContain("#if");
    const xml = await runProject(dir);
    expect(xml).toBe('<mekuru size="1920x1080" fps="30" lang="ja">\n  <seq/>\n</mekuru>\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
