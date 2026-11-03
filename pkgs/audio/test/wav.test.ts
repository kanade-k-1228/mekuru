import { expect, test } from "bun:test";
import { joinWavs, samples, wavSeconds } from "../src/wav.ts";

const wav = (rate = 8000) => {
  const b = Buffer.alloc(48);
  b.write("RIFF");
  b.writeUInt32LE(40, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(4, 40);
  b.writeInt16LE(-16384, 44);
  b.writeInt16LE(16384, 46);
  return b;
};
test("joining preserves samples and adds durations", () => {
  const input = wav();
  const joined = joinWavs([input, input]);
  expect(wavSeconds(joined)).toBe(wavSeconds(input) * 2);
  expect(samples(joined)).toEqual({ rate: 8000, data: new Float32Array([-0.5, 0.5, -0.5, 0.5]) });
});
test("rejects invalid WAVs and mismatched sample rates", () => {
  expect(() => samples(Buffer.from("invalid"))).toThrow("WAV");
  expect(() => joinWavs([wav(), wav(16000)])).toThrow("different audio formats");
});
