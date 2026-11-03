import type { FrameInterval, TimelineCompilation, TimelineEntry } from "@mekuru/protocol";
import { findCompiler } from "./compiler.js";
export type { FrameRate, FrameInterval, TimelineEntry, ResolvedTimeline, TimelineCompilation } from "@mekuru/protocol";

export async function compileTimeline(xmlPath: string, options: { root?: string } = {}): Promise<TimelineCompilation> {
  const args = [findCompiler(), xmlPath, "--emit-timeline"];
  if (options.root) args.push("--root", options.root);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(stderr.slice(-16000).trim() || `mekuru-compiler exited (${code})`);
  const result = JSON.parse(stdout) as TimelineCompilation;
  if (
    !result ||
    !Array.isArray(result.diagnostics) ||
    !("timeline" in result) ||
    (result.timeline !== null && (!Array.isArray(result.timeline?.entries) || !result.timeline?.fps))
  )
    throw new Error("unexpected compiler response; rebuild or update mekuru-compiler");
  return result;
}

/** Expand only this entry's logical intervals, not slot visibility. */
export function timelineIntervals(entry: TimelineEntry): FrameInterval[] {
  let intervals: FrameInterval[] = [{ startFrame: entry.startFrame, endFrame: entry.endFrame }];
  for (const r of [...entry.repeat].reverse()) {
    if (!Number.isSafeInteger(r.periodFrames) || r.periodFrames <= 0) throw new Error("invalid repeat period");
    const next: FrameInterval[] = [];
    for (const span of intervals) {
      for (let shift = 0; r.fromFrame + shift < r.untilFrame; shift += r.periodFrames) {
        const startFrame = span.startFrame + shift;
        const endFrame = Math.min(span.endFrame + shift, r.untilFrame);
        if (endFrame > startFrame) next.push({ startFrame, endFrame });
      }
    }
    intervals = next;
  }
  return intervals.filter((s) => s.endFrame > s.startFrame).sort((a, b) => a.startFrame - b.startFrame);
}
