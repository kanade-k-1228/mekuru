import { expect, test } from "bun:test";
import { joinWavs, samples, wavSeconds } from "../src/wav.ts";
import { wav } from "./fixture.ts";

test("joining preserves samples and adds durations", () => {
  const input = wav([-16384, 16384], 8000);
  const joined = joinWavs([input, input]);
  expect(wavSeconds(joined)).toBe(wavSeconds(input) * 2);
  expect(samples(joined)).toEqual({ rate: 8000, data: new Float32Array([-0.5, 0.5, -0.5, 0.5]) });
});
test("rejects invalid WAVs and mismatched sample rates", () => {
  expect(() => samples(Buffer.from("invalid"))).toThrow("WAV");
  expect(() => joinWavs([wav(2, 8000), wav(2, 16000)])).toThrow("different audio formats");
});
