import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewCompiler } from "../src/preview.ts";
import type { Compilation, StateDto } from "../src/protocol.ts";
import { startServer, type Server } from "../src/server.ts";

// The fixture is an executable script; Windows tests need a native .exe fixture.
describe.skipIf(process.platform === "win32")("Bun preview server", () => {
  let root: string;
  let previous: string | undefined;
  let server: Server | undefined;

  beforeEach(async () => {
    previous = process.env.MEKURU_COMPILER;
    root = await mkdtemp(join(tmpdir(), "mekuru-server-"));
    const compiler = join(root, "compiler");
    await Bun.write(
      compiler,
      `#!/usr/bin/env bun
const xml = await Bun.stdin.text();
if (xml.includes("slow")) await Bun.sleep(150);
if (xml.includes("crash")) { console.error("compiler failed"); process.exit(7); }
console.log(JSON.stringify(xml.includes("invalid")
  ? { preview: null, diagnostics: [{ severity: "error", code: "E001", line: 1, message: "invalid XML" }] }
  : { preview: { width: 100, height: 100, fps: 30, duration: 1, elements: [], timeline: { nodes: [], clips: [] } }, diagnostics: [] }));
`,
    );
    await chmod(compiler, 0o755);
    process.env.MEKURU_COMPILER = compiler;
    await Bun.write(join(root, "video.xml"), "<mekuru/>");
  });

  afterEach(async () => {
    server?.close();
    server = undefined;
    if (previous === undefined) delete process.env.MEKURU_COMPILER;
    else process.env.MEKURU_COMPILER = previous;
    await rm(root, { recursive: true, force: true });
  });

  const start = async () => {
    server = await startServer({ xml: join(root, "video.xml"), port: 0 });
    return server;
  };
  const state = async (): Promise<StateDto> => (await fetch(`${server?.url}/api/state`)).json() as Promise<StateDto>;

  const until = async (ready: () => boolean | Promise<boolean>) => {
    const deadline = Date.now() + 2000;
    while (!(await ready())) {
      if (Date.now() > deadline) throw new Error("timed out waiting for preview");
      await Bun.sleep(10);
    }
  };

  test("serves full files, HEAD and byte ranges, and rejects paths outside the project", async () => {
    await Bun.write(join(root, "media.mp4"), "0123456789");
    const { url } = await start();
    const file = `${url}/files/media.mp4`;
    const full = await fetch(file);
    expect(full.headers.get("content-type")).toContain("video/mp4");
    expect(await full.text()).toBe("0123456789");
    const head = await fetch(file, { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe("10");
    expect(await head.text()).toBe("");
    for (const [range, expected, contentRange] of [
      ["bytes=2-4", "234", "bytes 2-4/10"],
      ["bytes=7-", "789", "bytes 7-9/10"],
      ["bytes=-2", "89", "bytes 8-9/10"],
    ]) {
      const part = await fetch(file, { headers: { range } });
      expect(part.status).toBe(206);
      expect(part.headers.get("content-range")).toBe(contentRange);
      expect(await part.text()).toBe(expected);
    }
    expect((await fetch(file, { headers: { range: "bytes=99-" } })).status).toBe(416);
    expect((await fetch(`${url}/files/%2e%2e%2foutside`)).status).toBe(404);
    expect((await fetch(`${url}/files/%FF`)).status).toBe(404);
    expect((await fetch(`${url}/files/missing`)).status).toBe(404);
    expect((await fetch(`${url}/api/missing`)).status).toBe(404);
  });

  test("streams state, watches atomic XML replacement, and keeps the last successful preview on failure", async () => {
    const { url } = await start();
    const events = await fetch(`${url}/api/events`);
    if (!events.body) throw new Error("missing SSE stream");
    const reader = events.body.getReader();
    try {
      expect(events.headers.get("content-type")).toContain("text/event-stream");
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: state");
      await until(async () => (await state()).status === "ready");
      const ready = await state();
      await Bun.write(join(root, "next.xml"), "invalid");
      await rename(join(root, "next.xml"), join(root, "video.xml"));
      await until(async () => (await state()).status === "error");
      const failed = await state();
      expect(failed.error).toContain("invalid XML");
      expect(failed.preview).toEqual(ready.preview);
      expect(failed.previewVersion).toBe(ready.previewVersion);
      expect(failed.version).toBeGreaterThan(ready.version);
    } finally {
      await reader.cancel();
    }
  });

  test("compiles only the latest pending input and suppresses output after close", async () => {
    const results: [number, Compilation | Error][] = [];
    const compiler = previewCompiler(root, (version, result) => results.push([version, result]));
    try {
      compiler.update("slow", 1);
      compiler.update("invalid", 2);
      compiler.update("ok", 3);
      await until(() => results.length === 1);
      expect(results[0][0]).toBe(3);
      expect(results[0][1]).toHaveProperty("preview.width", 100);
      compiler.update("crash", 4);
      await until(() => results.length === 2);
      expect(results[1][1]).toBeInstanceOf(Error);
      expect((results[1][1] as Error).message).toBe("compiler failed");
      compiler.update("slow", 5);
      compiler.close();
      await Bun.sleep(200);
      expect(results.length).toBe(2);
    } finally {
      compiler.close();
    }
  });
});
