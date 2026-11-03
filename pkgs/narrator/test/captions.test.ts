import { expect, test } from "bun:test";
import { captionCues, toSrt } from "../src/captions.ts";

test("allocation partitions every feasible integer duration", () => {
  for (const fps of [24, 30, 60])
    for (let n = 1; n <= 12; n++)
      for (let frames = n; frames <= fps * 2; frames++) {
        const cues = captionCues(
          Array.from({ length: n }, (_, i) => "字".repeat(i + 1)),
          frames,
        );
        expect(cues.reduce((sum, c) => sum + c.frames, 0)).toBe(frames);
        let end = 0;
        for (const c of cues) {
          expect(c.offset).toBe(end);
          expect(c.frames).toBeGreaterThanOrEqual(1);
          end += c.frames;
        }
      }
});
test("explicit boundaries, weights, tail, and invalid inputs", () => {
  expect(captionCues([], 0)).toEqual([]);
  expect(captionCues(["a\nb", "c"], 10, { boundaries: [0, 3, 10] })).toEqual([
    { text: "a\nb", offset: 0, frames: 3 },
    { text: "c", offset: 3, frames: 7 },
  ]);
  const cues = captionCues(["a", "b"], 10, { weights: [0, 1] });
  expect(cues.map((c) => c.frames)).toEqual([1, 9]);
  cues[1].frames += 4;
  expect(cues[1].offset + cues[1].frames).toBe(14);
  for (const f of [
    () => captionCues([], 1),
    () => captionCues(["a", "b"], 1),
    () => captionCues([" "], 1),
    () => captionCues(["a"], 1.5),
    () => captionCues(["a"], 2, { weights: [0] }),
    () => captionCues(["a", "b"], 3, { boundaries: [0, 0, 3] }),
  ])
    expect(f).toThrow();
});
test("SRT converts absolute frame boundaries once, including fractional fps", () => {
  expect(
    toSrt(
      [
        { text: "first\nline", startFrame: 30, endFrame: 60 },
        { text: "before", startFrame: 0, endFrame: 30 },
      ],
      { num: 30000, den: 1001 },
    ),
  ).toBe("1\n00:00:00,000 --> 00:00:01,001\nbefore\n\n2\n00:00:01,001 --> 00:00:02,002\nfirst\nline\n");
  expect(() => toSrt([{ text: "a", startFrame: 0, endFrame: 1 }], { num: 10000, den: 1 })).toThrow();
});
