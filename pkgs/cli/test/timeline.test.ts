import { expect, test } from "bun:test";
import { timelineIntervals, type TimelineEntry } from "../src/timeline.ts";
const entry: TimelineEntry = {
  id: "n:1",
  parent: null,
  sourceId: "cue",
  kind: "par",
  startFrame: 0,
  endFrame: 2,
  repeat: [
    { fromFrame: 0, periodFrames: 4, untilFrame: 11 },
    { fromFrame: 0, periodFrames: 2, untilFrame: 4 },
  ],
};
test("nested repeat expansion clips the final round", () => {
  expect(timelineIntervals(entry)).toEqual([0, 2, 4, 6, 8, 10].map((startFrame) => ({ startFrame, endFrame: Math.min(startFrame + 2, 11) })));
  expect(timelineIntervals({ ...entry, repeat: [], endFrame: 0 })).toEqual([]);
  expect(() => timelineIntervals({ ...entry, repeat: [{ fromFrame: 0, periodFrames: 0, untilFrame: 2 }] })).toThrow();
});

test.skipIf(process.platform === "win32")("timeline API returns diagnostics and rejects process or protocol failures", async () => {
  const { mkdtemp, chmod, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { compileTimeline } = await import("../src/timeline.ts");
  const dir = await mkdtemp(join(tmpdir(), "mekuru-timeline-"));
  const compiler = join(dir, "compiler");
  const previous = process.env.MEKURU_COMPILER;
  try {
    process.env.MEKURU_COMPILER = compiler;
    await Bun.write(
      compiler,
      `#!/usr/bin/env bun
if (!process.argv.includes("--emit-timeline")) process.exit(8);
if (process.argv.includes("crash")) { console.error("failed to read XML"); process.exit(1); }
console.log(JSON.stringify(process.argv.includes("bad") ? {} : {timeline: null, diagnostics: [{code: "E001", severity: "error", line: 1, message: "invalid XML"}]}));
`,
    );
    await chmod(compiler, 0o755);
    const result = await compileTimeline("invalid", { root: dir });
    expect(result.timeline).toBeNull();
    expect(result.diagnostics[0].code).toBe("E001");
    await expect(compileTimeline("bad")).rejects.toThrow("unexpected compiler response");
    await expect(compileTimeline("crash")).rejects.toThrow("failed to read XML");
  } finally {
    if (previous === undefined) delete process.env.MEKURU_COMPILER;
    else process.env.MEKURU_COMPILER = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
