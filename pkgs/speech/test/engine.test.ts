import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { httpClient, run } from "../src/engine.ts";

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

test("subprocesses drain stdout and stderr while running", async () => {
  const { code, stdout, stderr } = await run(process.execPath, [
    "-e",
    'await Bun.write(Bun.stdout, "a".repeat(2_000_000)); await Bun.write(Bun.stderr, "b".repeat(2_000_000));',
  ]);
  expect(code).toBe(0);
  expect(stdout).toBe("a".repeat(2_000_000));
  expect(stderr).toBe("b".repeat(2_000_000));
});

test("subprocess exit codes can be checked or returned to the engine", async () => {
  const args = ["-e", 'console.error("engine failed"); process.exit(7)'];
  await expect(run(process.execPath, args)).rejects.toThrow("exit code 7\nengine failed");
  expect(await run(process.execPath, args, { check: false })).toMatchObject({ code: 7, stderr: "engine failed\n" });
});

test("subprocess timeouts terminate the engine and reject", async () => {
  await expect(run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeout: 100 })).rejects.toThrow("timed out after 0.1s");
  await expect(run("mekuru-test-nonexistent-engine", [])).rejects.toThrow();
});
