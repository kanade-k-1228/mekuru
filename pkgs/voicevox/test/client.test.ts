import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engine } from "../src/client.ts";

test("maps engine options and preserves returned audio", async () => {
  const requests: { path: string; body: unknown }[] = [];
  const mock = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      requests.push({ path: url.pathname + url.search, body: await req.text() });
      if (url.pathname === "/audio_query") return Response.json({});
      return new Response("audio fixture");
    },
  });
  const dir = await mkdtemp(join(tmpdir(), "mekuru-adapter-"));
  try {
    const file = join(dir, "line.wav");
    await engine(mock.url.toString()).synthesize({ speaker: 1, speed: 1.2 }, "hello", file);
    expect(await Bun.file(file).text()).toBe("audio fixture");
    expect(JSON.stringify(requests)).toContain("hello");
    expect(JSON.stringify(requests)).not.toContain("children");
  } finally {
    mock.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
});
