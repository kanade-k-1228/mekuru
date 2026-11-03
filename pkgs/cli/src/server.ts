import { runScript } from "./script.ts";
import { watchXml } from "./watch.ts";
import { compiledState } from "./state.ts";
import { sendFile, inside } from "./files.ts";
import { mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { previewCompiler } from "./preview.ts";
import { serializeEvent, snapshot, type SharedPreview } from "./share.ts";
import type { Diagnostic, StateDto } from "@mekuru/protocol";

export interface ServerOptions {
  xml: string;
  root?: string;
  run?: string;
  port: number;
  title?: string;
}

const projectRoot = (xml: string): string => {
  const dir = dirname(resolve(xml));
  return basename(dir) === ".mekuru" ? dirname(dir) : dir;
};

const VIEWER = join(import.meta.dir, "..", "viewer");

const NOT_BUILT = `<!doctype html><meta charset=utf-8><title>Mekuru Movie Maker</title><body style="font-family:sans-serif;padding:2em"><h1>Mekuru Movie Maker</h1><p>The viewer is not built.</p><pre>bun install\nbun run --cwd pkgs/viewer build</pre>`;

const log = (line: string) => process.stderr.write(`${new Date().toTimeString().slice(0, 8)} ${line}\n`);
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`;
const formatDiagnostic = (d: Diagnostic) => `L${d.line} ${d.code}: ${d.message}`;

export interface Server {
  url: string;
  close(): void;
}

export const startServer = async (opts: ServerOptions): Promise<Server> => {
  const xmlPath = resolve(opts.xml);
  const root = resolve(opts.root ?? projectRoot(xmlPath));
  const title = opts.title ?? opts.xml;

  let xml: string;
  if (await Bun.file(xmlPath).exists()) xml = await Bun.file(xmlPath).text();
  else if (opts.run) {
    mkdirSync(dirname(xmlPath), { recursive: true });
    xml = "<mekuru><seq/></mekuru>";
  } else throw new Error(`cannot read ${opts.xml}`);
  let closed = false;
  const cleanup: (() => void)[] = [];
  const close = () => {
    if (closed) return;
    closed = true;
    for (const dispose of cleanup.reverse()) dispose();
  };
  let writes = 0;
  let scriptError: string | null = null;
  let compileError: string | null = null;
  let current: StateDto = { path: title, version: 1, previewVersion: 0, status: "building", error: null, diagnostics: [] };
  let shared: SharedPreview | null = null;
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const emit = (event?: string) => {
    if (closed) return;
    current = { ...current, error: scriptError ?? compileError };
    const bytes = encoder.encode(event ?? serializeEvent({ type: "status", state: current }));
    for (const client of clients) client.enqueue(bytes);
  };
  let started = Date.now();
  const compiler = previewCompiler(root, (version, result, nextShared) => {
    if (closed || version !== current.version) return;
    let event: string | undefined;
    if (result instanceof Error) {
      compileError = result.message;
      current = { ...current, status: "error", diagnostics: [] };
      log(`error: the preview failed\n${result.message}`);
    } else {
      compileError = result.previewVersion !== null ? null : result.diagnostics.map(formatDiagnostic).join("\n");
      current = { ...compiledState(current, result), error: scriptError ?? compileError };
      shared = nextShared;
      if (result.update) event = serializeEvent({ ...result.update, state: current });
      const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;
      const head =
        result.previewVersion !== null
          ? `preview updated in ${seconds(started)}${warnings ? ` (${warnings} warning${warnings > 1 ? "s" : ""})` : ""}`
          : "error: the preview failed";
      log([head, ...result.diagnostics.map((d) => `  ${formatDiagnostic(d)}`)].join("\n"));
    }
    emit(event);
  });

  cleanup.push(() => compiler.close());

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: opts.port,
      idleTimeout: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/api/state") return Response.json(current, { headers: { "cache-control": "no-store" } });
        if (path === "/api/preview") {
          if (!shared) return new Response(null, { status: 404 });
          return Response.json(snapshot(current, shared), { headers: { "cache-control": "no-store" } });
        }
        if (path === "/api/events") {
          let client: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              client = controller;
              clients.add(client);
              client.enqueue(encoder.encode(serializeEvent(snapshot(current, shared))));
            },
            cancel() {
              clients.delete(client);
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
        }
        if (path.startsWith("/files/")) {
          const file = inside(root, path.slice("/files/".length));
          return file ? sendFile(req, file) : new Response(null, { status: 404 });
        }
        if (path.startsWith("/api/")) return new Response(null, { status: 404 });
        const index = join(VIEWER, "index.html");
        if (!(await Bun.file(index).exists())) return new Response(NOT_BUILT, { headers: { "content-type": "text/html; charset=utf-8" } });
        const file = inside(VIEWER, path === "/" ? "index.html" : path.slice(1));
        return sendFile(req, file && (await Bun.file(file).exists()) ? file : index);
      },
    });
  } catch (e) {
    close();
    if ((e as { code?: string }).code === "EADDRINUSE") throw new Error(`cannot listen on 127.0.0.1:${opts.port} (is the port in use? try --port)`);
    throw e;
  }
  cleanup.push(() => {
    for (const client of clients) client.close();
    clients.clear();
    void server.stop(true);
  });
  const url = `http://localhost:${server.port}`;
  const keepAlive = setInterval(() => {
    for (const c of clients) c.enqueue(encoder.encode(": keep-alive\n\n"));
  }, 15_000);
  cleanup.push(() => clearInterval(keepAlive));

  const changed = (text: string) => {
    if (closed) return;
    writes++;
    scriptError = null;
    if (text === xml) {
      log("the XML has not changed");
      emit();
      return;
    }
    xml = text;
    compileError = null;
    started = Date.now();
    current = { ...current, version: current.version + 1, status: "building", diagnostics: [] };
    emit();
    compiler.update(xml, current.version);
  };
  try {
    cleanup.push(watchXml(xmlPath, changed));
  } catch (e) {
    close();
    throw e;
  }

  if (opts.run)
    cleanup.push(
      runScript(
        opts.run,
        root,
        () => writes,
        (error) => {
          scriptError = error;
          emit();
        },
      ),
    );

  compiler.update(xml, current.version);
  return { url, close };
};
