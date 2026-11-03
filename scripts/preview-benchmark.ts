/** Run after `cargo build`: bun scripts/preview-benchmark.ts [text-count] [edits] [en|ja]. */
import { previewXml } from "./preview-fixture.ts";
import { lineReader } from "./fixtures/lines.ts";
import { findCompiler } from "../pkgs/core/npm/compiler.js";
import { previewStore } from "../pkgs/viewer/src/logic/preview.ts";
import type { PreviewEvent, StateDto, WorkerCompilation } from "../pkgs/protocol/src/index.ts";

const count = Number(process.argv[2] ?? 500);
const edits = Number(process.argv[3] ?? 10);
const language = process.argv[4] ?? "en";
if (![count, edits].every((n) => Number.isInteger(n) && n > 0)) throw new Error("text-count and edits must be positive integers");
if (language !== "en" && language !== "ja") throw new Error("language must be en or ja");
const compiler = findCompiler();
const xml = (edit: number) => previewXml(count, edit, language);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const baseline = [];
for (let edit = 0; edit < 5; edit++) {
  const start = performance.now();
  const proc = Bun.spawn([compiler, "-", "--emit-preview"], { stdin: new Blob([xml(edit)]), stdout: "pipe", stderr: "inherit" });
  const body = await new Response(proc.stdout).text();
  if (await proc.exited) throw new Error("single-shot compile failed");
  baseline.push({ wallMs: performance.now() - start, bytes: Buffer.byteLength(body) });
}
const worker = Bun.spawn([compiler, "-", "--preview-worker"], { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
const readLine = lineReader(worker.stdout);
const store = previewStore();
const samples = [];
let previewVersion: number | null = null;
const serializeEvent = (event: PreviewEvent) => JSON.stringify(event);
const browserEvents: PreviewEvent[] = [];
try {
  for (let edit = 0; edit <= edits; edit++) {
    const start = performance.now();
    worker.stdin.write(`${JSON.stringify({ version: edit + 1, xml: xml(edit), baseVersion: previewVersion })}\n`);
    await worker.stdin.flush();
    const body = await readLine();
    if (body === null) throw new Error("worker stopped");
    const result = JSON.parse(body) as WorkerCompilation;
    const workerWallMs = performance.now() - start;
    const state: StateDto = { path: "benchmark.xml", status: "ready", error: null, diagnostics: [], version: edit + 1, previewVersion: edit + 1 };
    const serializeStart = performance.now();
    const eventText = serializeEvent(result.update ? { ...result.update, state } : { type: "status", state });
    const serializeMs = performance.now() - serializeStart;
    const applyStart = performance.now();
    const event = JSON.parse(eventText) as PreviewEvent;
    if (event.type === "status") throw new Error("expected preview");
    store.apply(event);
    previewVersion = result.previewVersion;
    const applyMs = performance.now() - applyStart;
    samples.push({
      edit,
      ...result.stats,
      workerWallMs,
      workerBytes: Buffer.byteLength(body),
      messageBytes: Buffer.byteLength(eventText),
      serializeMs,
      applyMs,
      resourceCount: Object.keys(result.update?.resources ?? {}).length,
    });
    browserEvents.push(event);
  }
} finally {
  worker.kill();
}
const repeated = samples.slice(1);
const output = {
  count,
  edits,
  language,
  compiler,
  baseline: { medianMs: median(baseline.map((s) => s.wallMs)), bytes: baseline[0].bytes },
  first: samples[0],
  repeated: Object.fromEntries(
    ["compileMs", "diffMs", "workerWallMs", "workerBytes", "messageBytes", "serializeMs", "applyMs", "drawHits", "drawMisses", "resourceCount"].map((key) => [
      key,
      median(repeated.map((s) => s[key as keyof typeof s])),
    ]),
  ),
};
if (process.env.MEKURU_BENCH_OUT) {
  await Bun.write(`${process.env.MEKURU_BENCH_OUT}/events.json`, JSON.stringify(browserEvents));
  await Bun.write(`${process.env.MEKURU_BENCH_OUT}/results.json`, JSON.stringify(output, null, 2));
}
console.log(JSON.stringify(output, null, 2));
