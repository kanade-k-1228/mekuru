/** @jsxImportSource @mekuru/core */
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { toXml } from "@mekuru/core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wav = (samples: number): Buffer => {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(36 + samples * 2, 4);
  head.write("WAVEfmt ", 8, "latin1");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(48000, 24);
  head.writeUInt32LE(96000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "latin1");
  head.writeUInt32LE(samples * 2, 40);
  return Buffer.concat([head, Buffer.alloc(samples * 2)]);
};

const VOICES = [
  { voice_name: "tanaka-san_ja_JP", voice_version: "1.0.0", languages: ["ja_JP"], display_names: [{ language: "ja_JP", name: "田中傘" }] },
  { voice_name: "tanaka-san_ja_JP", voice_version: "2.0.0", languages: ["ja_JP"], display_names: [{ language: "ja_JP", name: "田中傘" }] },
];

let posts: Record<string, unknown>[] = [];
let deleted: string[] = [];
let auth: (string | null)[] = [];
let polls = 0;
let failText = "";

const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const path = new URL(req.url).pathname.replace("/api/talk/v1", "");
    auth.push(req.headers.get("authorization"));
    if (req.headers.get("authorization") !== `Basic ${btoa("me@example.com:secret")}`) return new Response("unauthorized", { status: 401 });
    if (path === "/voices") return Response.json({ items: VOICES });
    if (path === "/voices/tanaka-san_ja_JP/2.0.0") return Response.json({ style_names: ["normal", "happy"], default_style_weights: [1, 0] });
    if (path === "/speech-syntheses" && req.method === "POST") {
      const body = (await req.json()) as Record<string, unknown>;
      posts.push(body);
      return Response.json({ uuid: `u${posts.length}` });
    }
    const m = /^\/speech-syntheses\/(u\d+)(\/wav)?$/.exec(path);
    if (m && req.method === "DELETE") {
      deleted.push(m[1]);
      return new Response(null, { status: 204 });
    }
    if (m?.[2]) return new Response(wav(4800 * Number(m[1].slice(1))), { headers: { "content-type": "audio/wav" } });
    if (m) {
      const text = posts[Number(m[1].slice(1)) - 1].text;
      if (text === failText) return Response.json({ state: "failed" });
      return Response.json({ state: polls++ % 2 === 0 ? "running" : "succeeded" });
    }
    return new Response("not found", { status: 404 });
  },
});

let dir = "";
const before = process.cwd();
let Voisona: typeof import("../src/index.tsx").Voisona;
type Props = import("../src/index.tsx").VoisonaProps;
const say = (props: Props) =>
  toXml(
    <mekuru size="320x180">
      <Voisona {...props} />
    </mekuru>,
  );

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mekuru-voisona-"));
  process.chdir(dir);
  process.env.MEKURU_VOISONA_URL = `http://localhost:${server.port}`;
  ({ Voisona } = await import("../src/index.tsx"));
});

afterAll(async () => {
  process.chdir(before);
  server.stop(true);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  posts = [];
  deleted = [];
  auth = [];
  process.env.MEKURU_VOISONA_USER = "me@example.com";
  process.env.MEKURU_VOISONA_PASSWORD = "secret";
});

test("reads a line with the newest version of a voice found by its display name", async () => {
  const xml = await say({ voice: "田中傘", speed: 1.2, style: { happy: 0.5 }, children: "こんにちは" });
  expect(posts).toEqual([
    {
      language: "ja_JP",
      voice_name: "tanaka-san_ja_JP",
      voice_version: "2.0.0",
      global_parameters: { speed: 1.2, style_weights: [1, 0.5] },
      destination: "memory",
      force_enqueue: true,
      text: "こんにちは",
    },
  ]);
  expect(deleted).toEqual(["u1"]);
  expect(auth.every((a) => a === `Basic ${btoa("me@example.com:secret")}`)).toBe(true);
  expect(xml).toMatch(/<dur len="12">\s*<audio src="\.mekuru\/cache\/tts\/[^"]+\.wav" label="田中傘: こんにちは"\/>/);
});

test("splits long lines and joins the audio", async () => {
  await say({ voice: "tanaka-san_ja_JP", version: "1.0.0", "max-chars": 4, children: "あいう。えおか。" });
  expect(posts.map((p) => [p.text, p.voice_version])).toEqual([
    ["あいう。", "1.0.0"],
    ["えおか。", "1.0.0"],
  ]);
  expect(deleted).toEqual(["u1", "u2"]);
});

test("reports unknown voices, styles and versions with what VoiSona Talk has", async () => {
  await expect(say({ voice: "知声", children: "a" })).rejects.toThrow("has no voice `知声` (it has tanaka-san_ja_JP (田中傘)");
  await expect(say({ voice: "田中傘", style: { angry: 1 }, children: "b" })).rejects.toThrow("has no style `angry` (it has normal, happy)");
  await expect(say({ voice: "田中傘", version: "3.0.0", children: "c" })).rejects.toThrow("(it has 2.0.0, 1.0.0)");
});

test("failed syntheses are reported and deleted", async () => {
  failText = "だめ";
  await expect(say({ voice: "田中傘", children: "だめ" })).rejects.toThrow("VoiSona Talk could not read: だめ");
  expect(deleted).toEqual(["u1"]);
});

test("missing or wrong credentials say which environment variables to set", async () => {
  delete process.env.MEKURU_VOISONA_PASSWORD;
  await expect(say({ voice: "田中傘", children: "d" })).rejects.toThrow("MEKURU_VOISONA_USER and MEKURU_VOISONA_PASSWORD");
  process.env.MEKURU_VOISONA_PASSWORD = "wrong";
  await expect(say({ voice: "田中傘", children: "e" })).rejects.toThrow(/HTTP 401[\s\S]*MEKURU_VOISONA_PASSWORD/);
});
