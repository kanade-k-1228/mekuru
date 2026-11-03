import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewCompiler } from "../src/preview.ts";
import type { PreviewEvent, SnapshotEvent, StateDto, WorkerCompilation } from "@mekuru/protocol";
import { startServer, type Server } from "../src/server.ts";
import { compilation } from "./fixtures/preview.ts";

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
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  const { xml, version, knownResources } = request;
  appendFileSync(${JSON.stringify(join(root, "requests"))}, JSON.stringify({ xml, version, knownResources, pid: process.pid }) + "\\n");
  if (xml.includes("slow")) await Bun.sleep(150);
  if (xml.includes("once") && !existsSync(${JSON.stringify(join(root, "restarted"))})) {
    writeFileSync(${JSON.stringify(join(root, "restarted"))}, "yes"); process.exit(7);
  }
  if (xml.includes("crash")) { console.error("compiler failed"); process.exit(7); }
  const result = ${JSON.stringify(compilation())};
  result.version = version;
  if (xml.includes("warning")) result.diagnostics = [{ severity: "warning", code: "W001", line: 1, message: "warning only" }];
  if (xml.includes("changed")) result.preview.elements[0].drawings = ["A", "C"];
  if (xml.includes("invalid")) { result.preview = null; result.diagnostics = [{ severity: "error", code: "E001", line: 1, message: "invalid XML" }]; }
  const used = new Set(result.preview?.elements.flatMap(e => e.drawings) ?? []);
  result.resources = Object.fromEntries(Object.entries(result.resources).filter(([k]) => used.has(k) && !knownResources.includes(k)));
  console.log(JSON.stringify(result));
}
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
  const preview = async (): Promise<SnapshotEvent> => (await fetch(`${server?.url}/api/preview`)).json() as Promise<SnapshotEvent>;

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
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: snapshot");
      await until(async () => (await state()).status === "ready");
      const ready = await state();
      const readyPreview = await preview();
      await Bun.write(join(root, "next.xml"), "invalid");
      await rename(join(root, "next.xml"), join(root, "video.xml"));
      await until(async () => (await state()).status === "error");
      const failed = await state();
      expect(failed.error).toContain("invalid XML");
      expect((await preview()).preview).toEqual(readyPreview.preview);
      expect(failed.previewVersion).toBe(ready.previewVersion);
      expect(failed.version).toBeGreaterThan(ready.version);
    } finally {
      await reader.cancel();
    }
  });

  test("streams resource deltas and resource-free status, then snapshots on reconnect", async () => {
    const { url } = await start();
    await until(async () => (await state()).status === "ready");
    const response = await fetch(`${url}/api/events`);
    if (!response.body) throw new Error("missing SSE body");
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = "";
    const next = async (): Promise<PreviewEvent> => {
      while (!buffered.includes("\n\n")) buffered += (await reader.read()).value;
      const end = buffered.indexOf("\n\n");
      const event = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      return JSON.parse(event.split("\ndata: ")[1]) as PreviewEvent;
    };
    try {
      const first = await next();
      expect(first.type).toBe("snapshot");
      if (first.type !== "snapshot") throw new Error("snapshot expected");
      expect(Object.keys(first.resources).sort()).toEqual(["A", "B"]);
      await Bun.write(join(root, "video.xml"), "changed");
      const building = await next();
      expect(building.type).toBe("status");
      expect(building.state.status).toBe("building");
      expect(building).not.toHaveProperty("resources");
      const updated = await next();
      expect(updated.type).toBe("patch");
      if (updated.type !== "patch") throw new Error("patch expected");
      expect(Object.keys(updated.resources)).toEqual(["C"]);
      expect(updated.baseVersion).toBe(1);
      // Diagnostics alone update status, without advancing the displayed scene.
      await Bun.write(join(root, "video.xml"), "changed warning");
      const warningBuilding = await next();
      const warningReady = await next();
      expect(warningBuilding.type).toBe("status");
      expect(warningReady.type).toBe("status");
      expect(warningReady.state.previewVersion).toBe(2);
      expect(warningReady.state.diagnostics[0].code).toBe("W001");
      expect(warningReady).not.toHaveProperty("resources");
      const reconnect = await fetch(`${url}/api/events`);
      if (!reconnect.body) throw new Error("missing SSE body");
      const reReader = reconnect.body.getReader();
      const body = new TextDecoder().decode((await reReader.read()).value);
      expect(body).toStartWith("event: snapshot");
      const full = JSON.parse(body.split("\ndata: ")[1]) as SnapshotEvent;
      expect(Object.keys(full.resources).sort()).toEqual(["A", "C"]);
      await reReader.cancel();
    } finally {
      await reader.cancel();
    }
  });

  test("compiles only the latest pending input and suppresses output after close", async () => {
    const results: [number, WorkerCompilation | Error][] = [];
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
      const requests = (await Bun.file(join(root, "requests")).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(requests.filter((r) => r.xml === "crash")).toHaveLength(2);
      expect(requests.some((r) => r.xml === "invalid")).toBe(false);
      expect(requests[0].pid).toBe(requests[1].pid);
      // Discarded version 1 must not teach the worker that the CLI has its resources.
      expect(requests[1].knownResources).toEqual([]);
      compiler.update("slow", 5);
      compiler.close();
      await Bun.sleep(200);
      expect(results.length).toBe(2);
    } finally {
      compiler.close();
    }
  });
  test("restarts a failed worker once, preserving known resources and using the newest input", async () => {
    const results: [number, WorkerCompilation | Error][] = [];
    const compiler = previewCompiler(root, (version, result) => results.push([version, result]));
    try {
      compiler.update("ok", 1);
      await until(() => results.length === 1);
      compiler.update("slow once", 2);
      await Bun.sleep(30);
      compiler.update("changed", 3);
      await until(() => results.length === 2);
      expect(results[1][0]).toBe(3);
      const result = results[1][1] as WorkerCompilation;
      expect(Object.keys(result.resources)).toEqual(["C"]);
      const requests = (await Bun.file(join(root, "requests")).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(requests.map((r) => r.version)).toEqual([1, 2, 3]);
      expect(requests[0].pid).not.toBe(requests[2].pid);
      expect(requests[2].knownResources.sort()).toEqual(["A", "B"]);
    } finally {
      compiler.close();
    }
  });
});
