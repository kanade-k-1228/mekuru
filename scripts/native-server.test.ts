import { afterEach, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { appendFile, chmod, copyFile, mkdir, mkdtemp, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectPreview } from "./fixtures/preview-socket.ts";
import { startServer } from "./fixtures/native-server.ts";
import { findCompiler } from "../pkgs/core/npm/compiler.js";
import { previewXml } from "./preview-fixture.ts";
import { previewStore } from "../pkgs/viewer/src/logic/preview.ts";
import type { SnapshotEvent, StateDto } from "../pkgs/protocol/src/index.ts";

let root: string;
let xml: string;
let server: Awaited<ReturnType<typeof startServer>> | undefined;
// Windows runners can take seconds to start a freshly copied executable; waits end before the test does.
setDefaultTimeout(15000);
const until = async (check: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 10000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await Bun.sleep(10);
  }
};
// --run intentionally passes a user-provided shell command; quote paths as shell literals.
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
const state = async (): Promise<StateDto> => (await fetch(`${server?.url}/api/state`)).json() as Promise<StateDto>;
const snapshot = async (): Promise<SnapshotEvent> => (await fetch(`${server?.url}/api/preview`)).json() as Promise<SnapshotEvent>;
const save = async (text: string) => {
  await Bun.write(join(root, "next.xml"), text);
  await rename(join(root, "next.xml"), xml);
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mekuru-native-server-"));
  await mkdir(join(root, ".mekuru"));
  xml = join(root, ".mekuru/scene.xml");
  await Bun.write(xml, previewXml(100, 0, "ja"));
});
afterEach(async () => {
  server?.close();
  await server?.exited;
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

const connect = () => {
  if (!server) throw new Error("server not started");
  return connectPreview(server.url);
};

test("a relocated native executable serves its embedded UI without Bun or a viewer directory", async () => {
  const binary = join(root, process.platform === "win32" ? "standalone.exe" : "standalone");
  await copyFile(findCompiler(), binary);
  await chmod(binary, 0o755);
  server = await startServer({ xml, port: 0, compiler: binary, env: { ...process.env, PATH: root }, title: "Native 日本語" });
  const index = await fetch(server.url);
  expect(index.status).toBe(200);
  const html = await index.text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  expect(asset).toBeDefined();
  const javascript = await fetch(`${server.url}${asset}`);
  expect(javascript.headers.get("content-type")).toMatch(/javascript/);
  expect((await javascript.text()).length).toBeGreaterThan(1000);
  await until(async () => (await state()).status === "ready");
  expect((await state()).path).toBe("Native 日本語");
}, 15000);

test("streams media ranges, HEAD, revised asset URLs and rejects outside paths", async () => {
  await Bun.write(join(root, "日本語 media.mp4"), "0123456789");
  server = await startServer({ xml, port: 0 });
  const file = `${server.url}/files/${encodeURIComponent("日本語 media.mp4")}?revision=123`;
  expect(await (await fetch(file)).text()).toBe("0123456789");
  const head = await fetch(file, { method: "HEAD" });
  expect(head.headers.get("content-length")).toBe("10");
  expect(head.headers.get("content-type")).toBe("video/mp4");
  expect(await head.text()).toBe("");
  for (const [range, value, contentRange] of [
    ["bytes=2-4", "234", "bytes 2-4/10"],
    ["bytes=7-", "789", "bytes 7-9/10"],
    ["bytes=-2", "89", "bytes 8-9/10"],
  ]) {
    const part = await fetch(file, { headers: { range } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(contentRange);
    expect(await part.text()).toBe(value);
  }
  expect((await fetch(file, { headers: { range: "bytes=99-" } })).status).toBe(416);
  for (const path of ["/files/%2e%2e%2foutside", "/files/%FF", "/files/missing", "/files/", "/api/missing"]) {
    expect((await fetch(server.url + path)).status).toBe(404);
  }
  if (process.platform !== "win32") {
    await symlink(join(root, ".."), join(root, "escape"));
    expect((await fetch(`${server.url}/files/escape/`)).status).toBe(404);
  }
  expect((await fetch(file, { method: "POST" })).status).toBe(405);
});

test("native patches reconstruct the reconnect snapshot, retain failures and recover from edits", async () => {
  let watched = xml;
  if (process.platform !== "win32") {
    const alias = join(root, "linked");
    await symlink(join(root, ".mekuru"), alias);
    watched = join(alias, "scene.xml");
  }
  server = await startServer({ xml: watched, root, port: 0 });
  await until(async () => (await state()).status === "ready");
  const connection = await connect();
  const store = previewStore();
  try {
    const first = await connection.next();
    expect(first.type).toBe("snapshot");
    if (first.type === "status") throw new Error("missing snapshot");
    store.apply(first);
    await save(previewXml(100, 1, "ja"));
    const building = await connection.next();
    expect(building.type).toBe("status");
    expect(building.state.status).toBe("building");
    expect(building).not.toHaveProperty("resources");
    const patch = await connection.next();
    expect(patch.type).toBe("patch");
    if (patch.type !== "patch") throw new Error("expected patch");
    expect(Object.keys(patch.resources)).toHaveLength(1);
    const patched = store.apply(patch);
    const full = await snapshot();
    const fresh = previewStore();
    expect(patched).toEqual(fresh.apply(full));
    const reconnect = await connect();
    expect(await reconnect.next()).toEqual(full);
    reconnect.close();
    connection.send({ type: "resync" });
    expect(await connection.next()).toEqual(full);
    await save("<mekuru>");
    await connection.next();
    const failed = await connection.next();
    expect(failed.state.status).toBe("error");
    expect(failed.state.diagnostics.length).toBeGreaterThan(0);
    expect((await snapshot()).preview).toEqual(full.preview);
    await save(previewXml(100, 1, "ja"));
    await connection.next();
    const recovered = await connection.next();
    expect(recovered.type).toBe("status");
    expect(recovered.state.status).toBe("ready");
    expect(recovered.state.previewVersion).toBe(patch.version);
    // A large structural replacement is sent as a new snapshot.
    await save(previewXml(1, 0, "ja"));
    await connection.next();
    expect((await connection.next()).type).toBe("snapshot");
  } finally {
    connection.close();
  }
});

test("settles chunked writes and catches the latest edit during rapid saves", async () => {
  server = await startServer({ xml, port: 0 });
  await until(async () => (await state()).status === "ready");
  const version = (await state()).version;
  const text = previewXml(100, 2, "ja"),
    split = Math.floor(text.length / 2);
  await Bun.write(xml, text.slice(0, split));
  await Bun.sleep(5);
  await appendFile(xml, text.slice(split));
  await until(async () => (await state()).status === "ready" && (await state()).version > version);
  expect((await state()).version).toBe(version + 1);
  const connection = connect();
  try {
    await connection.next();
    // Observe the queued notification even if compilation finishes between HTTP polls.
    // Keep this a watcher/queue test, without a large font-dependent rendering workload.
    await save(previewXml(200, 1, "ja"));
    await until(async () => (await connection.next()).state.status === "building");
    await save(previewXml(100, 3, "ja"));
    await Bun.sleep(30);
    await save(previewXml(100, 4, "ja"));
    await until(async () => {
      const full = await snapshot();
      return full.state.status === "ready" && JSON.stringify(full.resources).includes("修正 4");
    });
  } finally {
    connection.close();
  }
}, 15000);

test.skipIf(process.platform === "win32")("--run reports stderr, clears it after a write, and stops child processes on shutdown", async () => {
  const script = join(root, "script.js");
  await Bun.write(
    script,
    `const fs = require('fs'); fs.writeFileSync('child.pid', String(process.pid)); console.error('\\x1b[31mscript failed\\x1b[0m'); setInterval(() => {}, 1000);`,
  );
  server = await startServer({ xml, port: 0, run: `${quote(process.execPath)} ${quote(script)}` });
  await until(async () => (await state()).error?.includes("script failed") ?? false);
  expect((await state()).error).not.toContain("\x1b");
  const pid = Number(await Bun.file(join(root, "child.pid")).text());
  await save(previewXml(100, 2, "ja"));
  await until(async () => (await state()).error === null && (await state()).status === "ready");
  server.close();
  expect(await server.exited).toBe(0);
  await until(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  });
});

test.skipIf(process.platform === "win32")("--run keeps stderr when the XML gets an event without a write", async () => {
  await Bun.write(join(root, "script.js"), `console.error('script failed'); setInterval(() => {}, 1000);`);
  server = await startServer({ xml, port: 0, run: `${quote(process.execPath)} script.js` });
  await until(async () => (await state()).error?.includes("script failed") ?? false);
  // macOS reports writes made just before the watch started; a mode change gives such an event everywhere.
  await chmod(xml, 0o600);
  await Bun.sleep(300);
  expect((await state()).error).toContain("script failed");
});

test("WebSocket handles duplex resync, policy errors and shutdown", async () => {
  server = await startServer({ xml, port: 0 });
  await until(async () => (await state()).status === "ready");
  const connection = await connect();
  const first = await connection.next();
  connection.send({ type: "resync" });
  expect(await connection.next()).toEqual(first);
  connection.socket.send(JSON.stringify({ type: "unsupported" }));
  expect((await connection.closed).code).toBe(1008);
  const binary = await connect();
  await binary.next();
  binary.socket.send(new Uint8Array([1, 2, 3]));
  expect((await binary.closed).code).toBe(1003);
  const reconnect = await connect();
  expect(await reconnect.next()).toEqual(first);
  server.close();
  const disconnected = await reconnect.closed;
  const exitCode = await server.exited;
  // Windows process termination does not deliver the POSIX shutdown signal.
  if (process.platform !== "win32") {
    expect(disconnected.code).toBe(1005); // Graceful close without an application status.
    expect(exitCode).toBe(0);
  }
});

test("WebSocket upgrade rejects cross-origin browser access and the old SSE endpoint", async () => {
  server = await startServer({ xml, port: 0 });
  const response = await fetch(`${server.url}/api/ws`, {
    headers: {
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      origin: "https://unrelated.example",
    },
  });
  expect(response.status).toBe(403);
  expect((await fetch(`${server.url}/api/events`)).status).toBe(404);
});
