/** Run after `cargo build`: bun scripts/preview-benchmark.ts [text-count] [edits] [en|ja]. */
import { lineReader } from "../pkgs/cli/src/lines.ts";
import { findCompiler } from "../pkgs/cli/src/compiler.ts";
import { previewEvent, sharePreview, type SharedPreview } from "../pkgs/cli/src/share.ts";
import { previewStore } from "../pkgs/viewer/src/logic/preview.ts";
import type { PreviewEvent, StateDto, WorkerCompilation } from "../pkgs/protocol/src/index.ts";

const count = Number(process.argv[2] ?? 500);
const edits = Number(process.argv[3] ?? 10);
const language = process.argv[4] ?? "en";
if (![count, edits].every((n) => Number.isInteger(n) && n > 0)) throw new Error("text-count and edits must be positive integers");
if (language !== "en" && language !== "ja") throw new Error("language must be en or ja");
const compiler = findCompiler();
const caption = (i: number, edit: number) => {
  const changed = i === Math.floor(count / 2);
  return language === "ja"
    ? `プレビュー計測用の字幕 ${changed ? `修正 ${edit}` : `番号 ${i}`} 日本語の折り返しを確認します`
    : `Caption ${changed ? `edited ${edit}` : `number ${i}`} for preview benchmark`;
};
const xml = (edit: number) =>
  `<mekuru size="640x360" fps="30"><seq>${Array.from(
    { length: count },
    (_, i) => `<dur len="30"><text x="10" y="20" size="32">${caption(i, edit)}</text></dur>`,
  ).join("")}</seq></mekuru>`;
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
let shared: SharedPreview | null = null;
const browserEvents: PreviewEvent[] = [];
try {
  for (let edit = 0; edit <= edits; edit++) {
    const start = performance.now();
    worker.stdin.write(`${JSON.stringify({ version: edit + 1, xml: xml(edit), knownResources: Object.keys(shared?.resources ?? {}) })}\n`);
    await worker.stdin.flush();
    const body = await readLine();
    if (body === null) throw new Error("worker stopped");
    const result = JSON.parse(body) as WorkerCompilation;
    const workerWallMs = performance.now() - start;
    const next = sharePreview(result, shared);
    const state: StateDto = { path: "benchmark.xml", status: "ready", error: null, diagnostics: [], version: edit + 1, previewVersion: edit + 1 };
    const serializeStart = performance.now();
    const eventText = previewEvent(state, shared, next);
    const serializeMs = performance.now() - serializeStart;
    const applyStart = performance.now();
    const event = JSON.parse(eventText.split("\ndata: ")[1]) as PreviewEvent;
    if (event.type === "status") throw new Error("expected preview");
    store.apply(event);
    const applyMs = performance.now() - applyStart;
    samples.push({
      edit,
      ...result.stats,
      workerWallMs,
      workerBytes: Buffer.byteLength(body),
      sseBytes: Buffer.byteLength(eventText),
      serializeMs,
      applyMs,
      resourceCount: Object.keys(result.resources).length,
    });
    browserEvents.push(event);
    shared = next;
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
    ["compileMs", "workerWallMs", "workerBytes", "sseBytes", "serializeMs", "applyMs", "drawHits", "drawMisses", "resourceCount"].map((key) => [
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
