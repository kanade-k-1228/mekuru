import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { httpClient } from "../src/engine.ts";

afterEach(() => mock.restore());

test("HTTP client forwards synthesis requests and returns audio unchanged", async () => {
  const response = new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "content-type": "audio/wav" } });
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(response);
  const call = httpClient("http://localhost:50021", "VOICEVOX", "Start VOICEVOX.");
  expect(
    await call("/synthesis?speaker=3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"text":"hello"}',
    }),
  ).toBe(response);
  expect(fetch).toHaveBeenCalledWith("http://localhost:50021/synthesis?speaker=3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"text":"hello"}',
    signal: expect.any(AbortSignal),
  });
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
});

test("HTTP errors show status and bounded response text without query parameters", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(400), { status: 422 }));
  const call = httpClient("http://localhost:50021", "VOICEVOX", "Start VOICEVOX.");
  await expect(call("/audio_query?text=hello")).rejects.toThrow(`VOICEVOX /audio_query: HTTP 422 ${"x".repeat(300)}`);
});

test("connection failures include engine-specific guidance", async () => {
  spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));
  const call = httpClient("http://localhost:50032", "COEIROINK", "Start COEIROINK v2.");
  await expect(call("/v1/speakers")).rejects.toThrow("COEIROINK is not reachable at http://localhost:50032 (connection refused).\nStart COEIROINK v2.");
});
