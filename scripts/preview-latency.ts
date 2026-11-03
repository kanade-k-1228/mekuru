/** Includes file writing, settling, compilation and SSE delivery. Run after building the compiler. */
import { previewXml } from "./preview-fixture.ts";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PreviewEvent } from "../pkgs/protocol/src/index.ts";

// Select an exported baseline startServer bundle for a before/after comparison.
const { startServer }: typeof import("../pkgs/cli/src/server.ts") = process.env.MEKURU_BENCH_SERVER
  ? await import(pathToFileURL(process.env.MEKURU_BENCH_SERVER).href)
  : await import("../pkgs/cli/src/server.ts");
const count = Number(process.argv[2] ?? 500),
  edits = Number(process.argv[3] ?? 10);
const language = process.argv[4] ?? "en";
if (![count, edits].every((n) => Number.isInteger(n) && n > 0) || !["en", "ja"].includes(language))
  throw new Error("expected [positive count] [positive edits] [en|ja]");
const xml = (edit: number) => previewXml(count, edit, language);
const root = await mkdtemp(join(tmpdir(), "mekuru-latency-"));
const file = join(root, "scene.xml");
const abort = new AbortController();
let server: Awaited<ReturnType<typeof startServer>> | undefined;
const timeout = setTimeout(() => abort.abort(), 30_000);
try {
  await Bun.write(file, xml(0));
  server = await startServer({ xml: file, port: 0 });
  const response = await fetch(`${server.url}/api/events`, { signal: abort.signal });
  if (!response.body) throw new Error("missing SSE stream");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  const next = async (): Promise<PreviewEvent> => {
    for (;;) {
      while (!buffered.includes("\n\n")) {
        const part = await reader.read();
        if (part.done) throw new Error("SSE ended");
        buffered += part.value;
      }
      const end = buffered.indexOf("\n\n"),
        event = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      const data = event.split("\ndata: ")[1];
      if (data) return JSON.parse(data) as PreviewEvent;
    }
  };
  while ((await next()).state.status !== "ready") {}
  const samples = [];
  for (let edit = 1; edit <= edits; edit++) {
    const start = performance.now();
    await Bun.write(join(root, "next.xml"), xml(edit));
    await rename(join(root, "next.xml"), file);
    let acceptedMs = 0;
    for (;;) {
      const event = await next();
      if (event.state.status === "building") acceptedMs = performance.now() - start;
      if (event.state.status === "error") throw new Error(event.state.error ?? "compile failed");
      if (event.state.status === "ready") {
        samples.push({ acceptedMs, readyMs: performance.now() - start });
        break;
      }
    }
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(
    JSON.stringify(
      { count, edits, language, medianAcceptedMs: median(samples.map((s) => s.acceptedMs)), medianReadyMs: median(samples.map((s) => s.readyMs)), samples },
      null,
      2,
    ),
  );
  await reader.cancel();
} finally {
  clearTimeout(timeout);
  abort.abort();
  server?.close();
  await rm(root, { recursive: true, force: true });
}
