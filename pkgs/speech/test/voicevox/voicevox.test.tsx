/** @jsxImportSource @mekuru/tsx */
import { expect, mock, test } from "bun:test";
import { Audio } from "@mekuru/audio";
import { Speech } from "@mekuru/speech/irodoru";
import { Voicevox, zunda } from "@mekuru/speech/voicevox";
import { wav } from "../../../audio/test/fixture.ts";
import { mockFetch, say, tempProject } from "../shared/project.tsx";

tempProject();

const serve = () => {
  const sent: { url: URL; body?: Record<string, unknown> }[] = [];
  mockFetch(async (input, init) => {
    const url = new URL(String(input));
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.pathname === "/speakers") return Response.json([{ name: "ずんだもん", styles: [{ name: "ノーマル", id: 3 }] }]);
    if (url.pathname === "/audio_query") return Response.json({ accent_phrases: [{ test: true }], speedScale: 1, pitchScale: 0.1 });
    return new Response(wav(4800));
  });
  return sent;
};

test("VOICEVOX has its own API settings and preserves audio_query fields", async () => {
  process.env.MEKURU_IRODORU_URL = "invalid irodoru URL";
  const sent = serve();
  const xml = await say(
    <Voicevox {...zunda} text="漢字" reading={{ 漢字: "かんじ" }} speed={1.2} intonation={1.1} volume={0.9} pre={0.2} post={0.3} pause-scale={0.5} />,
  );
  expect(sent.map((s) => s.url.href)).toEqual([
    "http://127.0.0.1:50021/audio_query?speaker=3&text=%E3%81%8B%E3%82%93%E3%81%98",
    "http://127.0.0.1:50021/synthesis?speaker=3",
  ]);
  expect(sent[1].body).toEqual({
    accent_phrases: [{ test: true }],
    speedScale: 1.2,
    pitchScale: 0.1,
    intonationScale: 1.1,
    volumeScale: 0.9,
    prePhonemeLength: 0.2,
    postPhonemeLength: 0.3,
    pauseLengthScale: 0.5,
    outputSamplingRate: 48000,
    outputStereo: false,
  });
  expect(xml).toContain('label="ずんだもん: 漢字"');
});

test("named speakers use VOICEVOX URL precedence and cached lines remain available offline", async () => {
  process.env.MEKURU_VOICEVOX_URL = "http://environment.test";
  const sent = serve();
  await say(<Voicevox speaker="ずんだもん/ノーマル" text="こんにちは" />);
  await say(<Voicevox speaker={3} text="こんにちは" url="http://explicit.test/" />);
  expect(sent.map((s) => s.url.host)).toEqual(["environment.test", "environment.test", "environment.test", "explicit.test", "explicit.test"]);
  mock.restore();
  const offline = mockFetch(async () => {
    throw new Error("offline");
  });
  const xml = await say(<Voicevox speaker="ずんだもん/ノーマル" text="こんにちは" name="別名" gain-db={-6} gap={12} />);
  expect(offline).not.toHaveBeenCalled();
  expect(xml).toContain('label="別名: こんにちは"');
  expect(xml).toContain('volume="0.501"');
  expect(xml).toContain('len="15"');
});

test("both clients coexist on one endpoint without sharing cache entries or synthesis settings", async () => {
  const sent = serve();
  const url = "http://both.test";
  const xml = await say(
    <>
      <Speech url={url} text="同じ" />
      <Voicevox url={url} {...zunda} text="同じ" />
    </>,
  );
  expect(sent.map((s) => s.url.pathname).toSorted()).toEqual(["/", "/audio_query", "/synthesis"]);
  const sources = [...xml.matchAll(/src="([^"]+\.wav)"/g)].map((m) => m[1]);
  expect(new Set(sources).size).toBe(2);
  await say(<Voicevox url={url} {...zunda} text="同じ" pitch={0.2} />);
  expect(sent).toHaveLength(5);
  expect(sent[4].body?.pitchScale).toBe(0.2);
});

test("Voicevox.prepare returns shared display/timing; failed requests can be retried", async () => {
  mockFetch(async () => {
    throw new Error("connection refused");
  });
  await expect(say(<Voicevox {...zunda} text="再試行" />)).rejects.toThrow("bun run voicevox");
  mock.restore();
  serve();
  const Narrator = async () => {
    const line = await Voicevox.prepare({ ...zunda, text: "漢字\n次", reading: { 漢字: "かんじ" }, gap: 3 });
    expect(line.display).toBe("漢字\n次");
    expect(line.audio.len).toBe(6);
    return <Audio source={line.audio} />;
  };
  expect(await say(<Narrator />)).toContain('len="6"');
  await say(<Voicevox {...zunda} text="再試行" />);
  await expect(say(<Voicevox speaker="存在しない話者" text="不明" />)).rejects.toThrow("VOICEVOX has no speaker");
});
