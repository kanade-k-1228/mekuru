/** @jsxImportSource @mekuru/tsx */
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toXml, type Node } from "@mekuru/tsx";
import { Speech, type SpeechProps } from "@mekuru/speech/irodoru";
import { wav } from "../../../audio/test/fixture.ts";
// Snapshot of irodoru/pkgs/server/openapi.json; refresh alongside API changes.
import openapi from "./fixtures/openapi.json";

let dir: string;
let cwd: string;
let env: string | undefined;
beforeEach(async () => {
  cwd = process.cwd();
  env = process.env.MEKURU_IRODORU_URL;
  delete process.env.MEKURU_IRODORU_URL;
  dir = await mkdtemp(join(tmpdir(), "mekuru-speech-"));
  process.chdir(dir);
});
afterEach(async () => {
  mock.restore();
  process.chdir(cwd);
  if (env === undefined) delete process.env.MEKURU_IRODORU_URL;
  else process.env.MEKURU_IRODORU_URL = env;
  await rm(dir, { recursive: true, force: true });
});

const say = (line: Node) => toXml(<mekuru>{line}</mekuru>);
const mockFetch = (fn: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) =>
  spyOn(globalThis, "fetch").mockImplementation(fn as typeof fetch);
const serve = () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  mockFetch(async (input, init) => {
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(init?.signal?.aborted).toBe(false);
    const url = new URL(String(input));
    expect(Object.hasOwn(openapi.paths, url.pathname)).toBe(true);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    for (const key of Object.keys(body)) expect(Object.hasOwn(openapi.components.schemas.TTSRequest.properties, key)).toBe(true);
    sent.push({ url: String(input), body });
    return new Response(wav(4800));
  });
  return sent;
};

test("sends irodoru settings directly while keeping text, placement and playback controls local", async () => {
  const sent = serve();
  const xml = await say(
    <Speech
      text={"API\n次"}
      reading={{ API: "エーピーアイ" }}
      name="案内"
      reference_audio_base64={wav(24000).toString("base64")}
      caption="楽しそうに"
      seed={42}
      num_steps={20}
      cfg_scale_text={2}
      cfg_scale_speaker={4}
      cfg_scale_caption={6}
      cfg_min_t={0.2}
      cfg_max_t={0.8}
      t_schedule="sway"
      sway_coeff={-0.5}
      duration_scale={1.2}
      seconds={2}
      trim_tail={false}
      gap={4}
      gain-db={-6}
      id="intro"
      at={0}
      len={60}
    />,
  );
  expect(sent).toEqual([
    {
      url: "http://127.0.0.1:8080/",
      body: {
        text: "エーピーアイ 次",
        reference_audio_base64: wav(24000).toString("base64"),
        caption: "楽しそうに",
        seed: 42,
        num_steps: 20,
        cfg_scale_text: 2,
        cfg_scale_speaker: 4,
        cfg_scale_caption: 6,
        cfg_min_t: 0.2,
        cfg_max_t: 0.8,
        t_schedule: "sway",
        sway_coeff: -0.5,
        duration_scale: 1.2,
        seconds: 2,
        trim_tail: false,
      },
    },
  ]);
  expect(Object.keys(sent[0].body).toSorted()).toEqual(Object.keys(openapi.components.schemas.TTSRequest.properties).toSorted());
  expect(xml).toContain('label="案内: API 次"');
  expect(xml).toContain('volume="0.501"');
  expect(xml).toContain('len="60"');
  expect(xml).toContain('id="intro"');
});

test("URL precedence and normalization; cache hits need no discovery or running server", async () => {
  const sent = serve();
  process.env.MEKURU_IRODORU_URL = "http://environment.test:8080/";
  await say(<Speech text="こんにちは" />);
  await say(<Speech text="こんにちは" url="http://explicit.test:8080///" />);
  expect(sent.map((s) => s.url)).toEqual(["http://environment.test:8080/", "http://explicit.test:8080/"]);
  expect(sent[0].body).toMatchObject({ seed: 1 });
  mock.restore();
  const offline = spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  const xml = await say(<Speech text="こんにちは" url="http://explicit.test:8080" seed={1} name="変更" gap={12} gain-db={-3} len={90} />);
  expect(offline).not.toHaveBeenCalled();
  expect(xml).toContain('label="変更: こんにちは"');
  expect(xml).toContain('len="90"');
});

test("all synthesis settings participate in cache identity, but equivalent display/readings do not", async () => {
  const sent = serve();
  await say(<Speech text="漢字" reading={{ 漢字: "かんじ" }} />);
  await say(<Speech text="かんじ" />);
  expect(sent).toHaveLength(1);
  const variants: Partial<SpeechProps>[] = [
    { caption: "声" },
    { seed: 2 },
    { reference_audio_base64: wav(24000).toString("base64") },
    { num_steps: 8 },
    { cfg_scale_text: 2 },
    { cfg_scale_speaker: 2 },
    { cfg_scale_caption: 2 },
    { cfg_min_t: 0.1 },
    { cfg_max_t: 0.9 },
    { t_schedule: "sway" },
    { t_schedule: "sway", sway_coeff: -2 },
    { duration_scale: 2 },
    { seconds: 2 },
    { trim_tail: false },
    { "max-chars": 50 },
    { url: "http://other.test" },
  ];
  for (const props of variants) await say(<Speech {...props} text="かんじ" />);
  expect(sent).toHaveLength(variants.length + 1);
});

test("splits Unicode text at punctuation, joins WAVs and adds the gap once", async () => {
  const sent = serve();
  const xml = await say(<Speech max-chars={4} seed={7} text="あ😀う。えおか。" gap={3} />);
  expect(sent.map((s) => s.body.text)).toEqual(["あ😀う。", "えおか。"]);
  expect(sent.map((s) => s.body.seed)).toEqual([7, 7]);
  expect(xml).toContain('len="9"'); // two 0.1s WAVs at 30fps, plus 3 frames
  expect(xml.match(/<audio\b/g)).toHaveLength(1);
});

test("default split limit is 100; invalid settings and seconds with splitting fail before HTTP", async () => {
  const sent = serve();
  await say(<Speech text={"あ".repeat(101)} />);
  expect(sent.map((s) => String(s.body.text).length)).toEqual([100, 1]);
  sent.length = 0;
  const invalid: Partial<SpeechProps>[] = [
    { "max-chars": 0 },
    { "max-chars": 1001 },
    { "max-chars": NaN },
    { "max-chars": 2.5 },
    { seed: -1 },
    { seed: Number.MAX_SAFE_INTEGER + 1 },
    { seed: Infinity },
    { seconds: 31 },
    { seconds: 0.1 },
    { seconds: 2, "max-chars": 1 },
    { num_steps: 0 },
    { num_steps: 201 },
    { duration_scale: 0 },
    { duration_scale: 6 },
    { cfg_scale_text: NaN },
    { url: "file:///tmp" },
  ];
  for (const props of invalid) await expect(say(<Speech {...props} text="あいう" />)).rejects.toThrow();
  await expect(say(<Speech text=" " />)).rejects.toThrow("nothing to say");
  expect(sent).toHaveLength(0);
});

test("concurrent duplicate lines share one request; failures release the queue and leave no partial cache", async () => {
  let calls = 0;
  let active = 0;
  let peak = 0;
  const fetchMock = mockFetch(async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await Bun.sleep(10);
    active--;
    return new Response(wav(4800));
  });
  await say(
    <>
      <Speech text="同じ" />
      <Speech text="同じ" />
      <Speech text="別" />
    </>,
  );
  expect(calls).toBe(2);
  expect(peak).toBe(1);
  fetchMock.mockRejectedValue(new Error("connection refused"));
  await expect(say(<Speech text="失敗" />)).rejects.toThrow("MEKURU_IRODORU_URL");
  fetchMock.mockResolvedValue(new Response("x".repeat(400), { status: 422 }));
  await expect(say(<Speech text="失敗" />)).rejects.toThrow(/^irodoru \/: HTTP 422 x{300}$/);
  fetchMock.mockResolvedValue(new Response("not audio"));
  await expect(say(<Speech text="失敗" />)).rejects.toThrow("not a WAV");
  fetchMock.mockResolvedValue(new Response(wav(0)));
  await expect(say(<Speech text="失敗" />)).rejects.toThrow("empty WAV");
  fetchMock.mockRestore();
  mockFetch(async () => new Response(wav(4800)));
  await say(<Speech text="失敗" />);
  const files = await readdir(join(dir, ".mekuru/cache/tts"), { recursive: true });
  expect(files.filter((p) => p.endsWith(".wav"))).toHaveLength(3);
  expect(files.some((p) => p.endsWith(".part"))).toBe(false);
});

test("near-limit output warns about incomplete speech, but an explicit target duration does not", async () => {
  mockFetch(async () => new Response(wav(48000 * 30)));
  const warning = spyOn(console, "warn").mockImplementation(() => {});
  await say(<Speech text="長いセリフ" />);
  expect(warning).toHaveBeenCalledTimes(1);
  expect(warning.mock.calls[0][0]).toContain("reduce max-chars");
  await say(<Speech text="長いセリフ" seconds={30} />);
  expect(warning).toHaveBeenCalledTimes(1);
});

test("removed model selection fails locally instead of silently using a different server model", async () => {
  const sent = serve();
  // @ts-expect-error Models are now selected when starting the server, not per request.
  await expect(say(<Speech text="こんにちは" model="anime" />)).rejects.toThrow("select the model when starting the server");
  expect(sent).toHaveLength(0);
});

test("WAV with embedded generation conditions needs no legacy response headers and is cached intact", async () => {
  const metadata = Buffer.from(`${JSON.stringify({ model: "anime", seed: 42, num_steps: 4 })}\0`);
  const list = Buffer.alloc(20 + metadata.length + (metadata.length % 2));
  list.write("LIST", 0);
  list.writeUInt32LE(list.length - 8, 4);
  list.write("INFOICMT", 8);
  list.writeUInt32LE(metadata.length, 16);
  metadata.copy(list, 20);
  const pcm = wav(4800);
  // Unknown chunks may precede data; they must not affect duration or sample parsing.
  const audio = Buffer.concat([pcm.subarray(0, 36), list, pcm.subarray(36)]);
  audio.writeUInt32LE(audio.length - 8, 4);
  mockFetch(
    async () =>
      new Response(audio, {
        headers: { "content-type": "audio/wav", "content-disposition": 'attachment; filename="conditions.wav"' },
      }),
  );
  const xml = await say(<Speech text="生成条件付き" gap={0} />);
  expect(xml).toContain('len="3"');
  const src = xml.match(/src="([^"]+\.wav)"/)?.[1];
  if (!src) throw new Error("missing cached WAV in XML");
  expect(Buffer.from(await Bun.file(join(dir, src)).arrayBuffer())).toEqual(audio);
});
