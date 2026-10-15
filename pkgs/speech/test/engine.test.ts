import assert from "node:assert/strict";
import { test } from "node:test";
import { httpClient } from "../src/engine.ts";

test("HTTP client forwards synthesis requests and returns audio unchanged", async (t) => {
  const response = new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "content-type": "audio/wav" } });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "http://localhost:50021/synthesis?speaker=3");
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { "Content-Type": "application/json" });
    assert.equal(init.body, '{"text":"hello"}');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    return response;
  });
  const call = httpClient("http://localhost:50021", "VOICEVOX", "Start VOICEVOX.");
  assert.equal(
    await call("/synthesis?speaker=3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"text":"hello"}',
    }),
    response,
  );
});

test("HTTP errors show status and bounded response text without query parameters", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("x".repeat(400), { status: 422 }));
  const call = httpClient("http://localhost:50021", "VOICEVOX", "Start VOICEVOX.");
  await assert.rejects(call("/audio_query?text=hello"), {
    message: `VOICEVOX /audio_query: HTTP 422 ${"x".repeat(300)}`,
  });
});

test("connection failures include engine-specific guidance", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("connection refused");
  });
  const call = httpClient("http://localhost:50032", "COEIROINK", "Start COEIROINK v2.");
  await assert.rejects(call("/v1/speakers"), {
    message: "COEIROINK is not reachable at http://localhost:50032 (connection refused).\nStart COEIROINK v2.",
  });
});
