/** Includes file writing, settling, compilation and WebSocket delivery. Run after building the compiler. */
import { connectPreview } from "./fixtures/preview-socket.ts";
import { previewXml } from "./preview-fixture.ts";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./fixtures/native-server.ts";
const count = Number(process.argv[2] ?? 500),
  edits = Number(process.argv[3] ?? 10);
const language = process.argv[4] ?? "en";
if (![count, edits].every((n) => Number.isInteger(n) && n > 0) || !["en", "ja"].includes(language))
  throw new Error("expected [positive count] [positive edits] [en|ja]");
const xml = (edit: number) => previewXml(count, edit, language);
const root = await mkdtemp(join(tmpdir(), "mekuru-latency-"));
const file = join(root, "scene.xml");
let connection: Awaited<ReturnType<typeof connectPreview>> | undefined;
let server: Awaited<ReturnType<typeof startServer>> | undefined;
const timeout = setTimeout(() => {
  connection?.close();
  server?.close();
}, 30_000);
try {
  await Bun.write(file, xml(0));
  server = await startServer({ xml: file, port: 0 });
  connection = await connectPreview(server.url);
  const { next } = connection;
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
  connection.close();
} finally {
  clearTimeout(timeout);
  connection?.close();
  server?.close();
  await rm(root, { recursive: true, force: true });
}
