import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessToken } from "../src/auth.ts";
import { readSettings, videoResource } from "../src/settings.ts";
import { uploadVideo } from "../src/upload.ts";

let root: string;
let previous: string | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mekuru-youtube-"));
  previous = process.env.MEKURU_CONFIG_DIR;
  process.env.MEKURU_CONFIG_DIR = root;
});

afterEach(async () => {
  mock.restore();
  await server?.stop(true);
  server = undefined;
  if (previous === undefined) delete process.env.MEKURU_CONFIG_DIR;
  else process.env.MEKURU_CONFIG_DIR = previous;
  await rm(root, { recursive: true, force: true });
});

test("OAuth checks state and PKCE, saves a private token and reuses it", async () => {
  let challenge = "";
  const grants: string[] = [];
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const form = new URLSearchParams(await req.text());
      const grant = form.get("grant_type") ?? "";
      grants.push(grant);
      expect(form.get("client_id")).toBe("test-client");
      if (grant === "authorization_code") {
        expect(form.get("code")).toBe("test-code");
        expect(new Bun.CryptoHasher("sha256").update(form.get("code_verifier") ?? "").digest("base64url")).toBe(challenge);
        return Response.json({ access_token: "first", refresh_token: "refresh" });
      }
      expect(form.get("refresh_token")).toBe("refresh");
      return Response.json({ access_token: "renewed" });
    },
  });
  await Bun.write(
    join(root, "youtube-client.json"),
    JSON.stringify({
      installed: {
        client_id: "test-client",
        client_secret: "test-secret",
        token_uri: `http://127.0.0.1:${server.port}/token`,
      },
    }),
  );
  let callback: Promise<void> = Promise.resolve();
  const open = mock((url: string) => {
    callback = (async () => {
      const params = new URL(url).searchParams;
      challenge = params.get("code_challenge") ?? "";
      const redirect = params.get("redirect_uri");
      expect((await fetch(`${redirect}?state=wrong&code=bad`)).status).toBe(404);
      const res = await fetch(`${redirect}?state=${params.get("state")}&code=test-code`);
      expect(await res.text()).toContain("signed in");
    })();
  });
  expect(await accessToken(open)).toBe("first");
  await callback;
  const token = Bun.file(join(root, "youtube-token.json"));
  expect(await token.json()).toEqual({ refresh_token: "refresh" });
  if (process.platform !== "win32") expect((await token.stat()).mode & 0o777).toBe(0o600);
  expect(await accessToken(open)).toBe("renewed");
  expect(open).toHaveBeenCalledTimes(1);
  expect(grants).toEqual(["authorization_code", "refresh_token"]);
});

test("OAuth denial reaches the browser before the callback server closes", async () => {
  await Bun.write(join(root, "youtube-client.json"), JSON.stringify({ installed: { client_id: "fixture", client_secret: "fixture" } }));
  let callback: Promise<string> = Promise.resolve("");
  const token = accessToken((url) => {
    const params = new URL(url).searchParams;
    callback = fetch(`${params.get("redirect_uri")}?state=${params.get("state")}&error=access_denied`).then((r) => r.text());
  });
  await expect(token).rejects.toThrow("the sign-in failed: access_denied");
  expect(await callback).toContain("the sign-in failed");
  expect(await Bun.file(join(root, "youtube-token.json")).exists()).toBe(false);
});

test("video upload reads consecutive chunks from the Bun file", async () => {
  const chunk = 8 * 1024 * 1024;
  const content = new Uint8Array(chunk + 17).fill(42);
  content.fill(99, chunk);
  const file = join(root, "video.mp4");
  await Bun.write(file, content);
  const fetch = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { headers: { location: "https://upload.invalid/session" } }))
    .mockResolvedValueOnce(new Response(null, { status: 308, headers: { range: `bytes=0-${chunk - 1}` } }))
    .mockResolvedValueOnce(Response.json({ id: "video-id" }));
  const progress = mock();
  expect(await uploadVideo(file, videoResource({ title: "Test" }), "token", { progress })).toEqual({ id: "video-id" });
  const first = fetch.mock.calls[1][1];
  const last = fetch.mock.calls[2][1];
  expect(new Headers(first?.headers).get("content-range")).toBe(`bytes 0-${chunk - 1}/${content.length}`);
  expect(new Headers(last?.headers).get("content-range")).toBe(`bytes ${chunk}-${content.length - 1}/${content.length}`);
  expect(new Uint8Array(await new Response(first?.body).arrayBuffer())).toEqual(content.subarray(0, chunk));
  expect(new Uint8Array(await new Response(last?.body).arrayBuffer())).toEqual(content.subarray(chunk));
  expect(progress.mock.calls).toEqual([
    [chunk, content.length],
    [content.length, content.length],
  ]);
});

test("Bun YAML preserves upload settings and validation", async () => {
  const file = join(root, "youtube.yaml");
  await Bun.write(file, "title: 動画\ndescription:\n  - first\n  - second\ncategory: 27\nmadeForKids: false\npublishAt: 2026-11-01T18:00:00+09:00\n");
  expect(videoResource(await readSettings(file))).toEqual({
    snippet: { title: "動画", description: "first\nsecond", categoryId: "27", tags: undefined },
    status: { privacyStatus: "private", publishAt: "2026-11-01T18:00:00+09:00", selfDeclaredMadeForKids: false },
  });
  await Bun.write(file, "title: Test\nunknown: value\n");
  await expect(readSettings(file)).rejects.toThrow('unknown setting "unknown"');
});
