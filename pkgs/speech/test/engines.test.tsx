/** @jsxImportSource @mekuru/types */
import { afterAll, afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toXml, type Node } from "@mekuru/types";
import { wav } from "../../audio/test/fixture.ts";
import { Coeiroink } from "../src/coeiroink/index.tsx";
import { StyleBertVits2 } from "../src/style-bert-vits2/index.tsx";
import { Voicevox } from "../src/voicevox/index.tsx";

const ENV = ["MEKURU_VOICEVOX_URL", "MEKURU_COEIROINK_URL", "MEKURU_STYLE_BERT_VITS2_URL"];
const before = { cwd: process.cwd(), env: ENV.map((key) => process.env[key]) };
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mekuru-engines-"));
  process.chdir(dir);
  for (const key of ENV) delete process.env[key];
  process.env.MEKURU_COEIROINK_URL = "http://coeiroink.test:2/";
  process.env.MEKURU_STYLE_BERT_VITS2_URL = "http://sbv2.test:4";
});

afterAll(async () => {
  process.chdir(before.cwd);
  ENV.forEach((key, i) => {
    if (before.env[i] === undefined) delete process.env[key];
    else process.env[key] = before.env[i];
  });
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => mock.restore());

/** Answers the paths in `json` with JSON and anything else with a WAV, and keeps what was sent. */
const serve = (json: Record<string, unknown> = {}) => {
  const sent: unknown[][] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const line = `${init?.method ?? "GET"} ${decodeURIComponent(url.href)}`;
    sent.push(typeof init?.body === "string" ? [line, JSON.parse(init.body)] : [line]);
    return url.pathname in json ? Response.json(json[url.pathname]) : new Response(wav(4800));
  };
  spyOn(globalThis, "fetch").mockImplementation(fetch as typeof globalThis.fetch);
  return sent;
};

const say = (line: Node) => toXml(<mekuru>{line}</mekuru>);

const SBV2 =
  "http://sbv2.test:4/voice?model_name=amitaro&language=JP&speaker_name=あみたろ&style=Happy&style_weight=5&sdp_ratio=0.2&noise=0.6&noisew=0.8&length=1.1&assist_text=楽しい&assist_text_weight=0.5";

const cases: { name: string; line: Node; json?: Record<string, unknown>; label: string; sent: unknown[][] }[] = [
  {
    name: "VOICEVOX sets the options on the audio query, at its default server",
    line: <Voicevox speaker={3} speed={1.2} pitch={0.1} intonation={1.1} volume={0.9} pre={0.2} post={0.3} pause-scale={0.5} text="こんにちは" />,
    json: { "/audio_query": { accent_phrases: [], speedScale: 1 } },
    label: "3: こんにちは",
    sent: [
      ["POST http://127.0.0.1:50021/audio_query?speaker=3&text=こんにちは"],
      [
        "POST http://127.0.0.1:50021/synthesis?speaker=3",
        {
          accent_phrases: [],
          speedScale: 1.2,
          pitchScale: 0.1,
          intonationScale: 1.1,
          volumeScale: 0.9,
          prePhonemeLength: 0.2,
          postPhonemeLength: 0.3,
          pauseLengthScale: 0.5,
          outputSamplingRate: 48000,
          outputStereo: false,
        },
      ],
    ],
  },
  {
    name: "VOICEVOX finds a speaker by name, at the server of `url`",
    line: <Voicevox speaker="四国めたん/ノーマル" name="めたん" url="http://voicevox.test:1/" text="やあ" />,
    json: { "/speakers": [{ name: "四国めたん", styles: [{ name: "ノーマル", id: 2 }] }], "/audio_query": {} },
    label: "めたん: やあ",
    sent: [
      ["GET http://voicevox.test:1/speakers"],
      ["POST http://voicevox.test:1/audio_query?speaker=2&text=やあ"],
      ["POST http://voicevox.test:1/synthesis?speaker=2", { outputSamplingRate: 48000, outputStereo: false }],
    ],
  },
  {
    name: "COEIROINK fills in the options that are not set, at the server of its environment variable",
    line: <Coeiroink speaker="Test/normal" speed={1.5} pause={0.2} text="こんにちは" />,
    json: { "/v1/speakers": [{ speakerName: "Test", speakerUuid: "uuid-1", styles: [{ styleName: "normal", styleId: 7 }] }] },
    label: "Test/normal: こんにちは",
    sent: [
      ["GET http://coeiroink.test:2/v1/speakers"],
      [
        "POST http://coeiroink.test:2/v1/synthesis",
        {
          speakerUuid: "uuid-1",
          styleId: 7,
          text: "こんにちは",
          prosodyDetail: [],
          speedScale: 1.5,
          pitchScale: 0,
          intonationScale: 1,
          volumeScale: 1,
          prePhonemeLength: 0.1,
          postPhonemeLength: 0.1,
          pauseLength: 0.2,
          outputSamplingRate: 48000,
        },
      ],
    ],
  },
  {
    name: "Style-Bert-VITS2 checks the model and reads a long line part by part, at the server of its environment variable",
    line: (
      <StyleBertVits2
        model="amitaro"
        speaker="あみたろ"
        style="Happy"
        style-weight={5}
        sdp-ratio={0.2}
        noise={0.6}
        noise-w={0.8}
        length={1.1}
        assist-text="楽しい"
        assist-text-weight={0.5}
        max-chars={4}
        text="あいう。えおか。"
      />
    ),
    json: { "/models/info": { 0: { model_path: "model_assets/amitaro/amitaro.safetensors", spk2id: { あみたろ: 0 }, style2id: { Neutral: 0, Happy: 1 } } } },
    label: "あみたろ: あいう。えおか。",
    sent: [["GET http://sbv2.test:4/models/info"], [`POST ${SBV2.replace("?", "?text=あいう。&")}`], [`POST ${SBV2.replace("?", "?text=えおか。&")}`]],
  },
];

for (const { name, line, json, label, sent } of cases) {
  test(name, async () => {
    const requests = serve(json);
    expect(await say(line)).toContain(`label="${label}"`);
    expect(requests).toEqual(sent);
  });
}

test("a speaker list that failed to load is loaded again for the next line", async () => {
  const line = <Voicevox speaker="四国めたん" url="http://voicevox.test:3" text="まだ" />;
  spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));
  await expect(say(line)).rejects.toThrow("VOICEVOX is not reachable at http://voicevox.test:3");
  mock.restore();
  const requests = serve({ "/speakers": [{ name: "四国めたん", styles: [{ name: "ノーマル", id: 2 }] }], "/audio_query": {} });
  expect(await say(line)).toContain('label="四国めたん: まだ"');
  expect(requests[0]).toEqual(["GET http://voicevox.test:3/speakers"]);
});

test("errors name the engine, and an unreachable server says how to start it", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(400), { status: 422 }));
  await expect(say(<Voicevox speaker={1} text="だめ" />)).rejects.toThrow(/^VOICEVOX \/audio_query: HTTP 422 x{300}$/);
  mock.restore();
  spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));
  await expect(say(<Coeiroink speaker={1} text="だめ" />)).rejects.toThrow(
    "COEIROINK is not reachable at http://coeiroink.test:2 (connection refused).\n" +
      "  - start COEIROINK v2 (its engine listens on port 50032 once the app has started)\n" +
      '  - if it runs elsewhere, set `url="http://<host>:50032"` on the component or the MEKURU_COEIROINK_URL environment variable\n' +
      "  - from WSL2, with COEIROINK on Windows: turn on mirrored networking (`networkingMode=mirrored` in .wslconfig)",
  );
});
