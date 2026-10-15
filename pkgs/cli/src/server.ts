import { existsSync, mkdirSync, unwatchFile, watch, watchFile } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { previewCompiler } from "./preview.ts";
import type { Diagnostic, StateDto } from "./protocol.ts";

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

const sendFile = async (req: Request, path: string): Promise<Response> => {
  const file = Bun.file(path);
  if (!(await file.exists())) return new Response(null, { status: 404 });
  const size = file.size;
  const headers = { "content-type": file.type, "accept-ranges": "bytes", "cache-control": "no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = Math.max(0, range[1] ? Number(range[1]) : size - Number(range[2]));
    const end = Math.min(size - 1, range[1] && range[2] ? Number(range[2]) : size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(req.method === "HEAD" ? null : file.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(req.method === "HEAD" ? null : file, { headers: { ...headers, "content-length": String(size) } });
};

const inside = (dir: string, rel: string): string | undefined => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return undefined;
  }
  const path = resolve(dir, `.${sep}${decoded}`);
  return path === dir || path.startsWith(dir + sep) ? path : undefined;
};

export const openBrowser = (url: string): void => {
  const wsl = process.platform === "linux" && (!!process.env.WSL_INTEROP || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop"));
  const tries: string[][] = wsl
    ? [["wslview"], ["cmd.exe", "/c", "start", ""]]
    : process.platform === "darwin"
      ? [["open"]]
      : process.platform === "win32"
        ? [["cmd", "/c", "start", ""]]
        : [["xdg-open"]];
  for (const [cmd, ...args] of tries) {
    try {
      Bun.spawn([cmd, ...args, url], { stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: wsl ? "/mnt/c" : undefined }).unref();
      break;
    } catch {}
  }
};

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
  let current: StateDto = { path: title, version: 1, previewVersion: 0, status: "building", error: null, diagnostics: [], preview: null };
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const send = (client: ReadableStreamDefaultController<Uint8Array>) => client.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(current)}\n\n`));
  const emit = () => {
    if (closed) return;
    current = { ...current, error: scriptError ?? compileError };
    clients.forEach(send);
  };
  let started = Date.now();
  const compiler = previewCompiler(root, (version, result) => {
    if (closed || version !== current.version) return;
    if (result instanceof Error) {
      compileError = result.message;
      current = { ...current, status: "error", diagnostics: [] };
      log(`error: the preview failed\n${result.message}`);
    } else {
      compileError = result.preview ? null : result.diagnostics.map(formatDiagnostic).join("\n");
      current = {
        ...current,
        status: result.preview ? "ready" : "error",
        diagnostics: result.diagnostics,
        preview: result.preview ?? current.preview,
        previewVersion: result.preview ? version : current.previewVersion,
      };
      const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;
      const head = result.preview
        ? `preview updated in ${seconds(started)}${warnings ? ` (${warnings} warning${warnings > 1 ? "s" : ""})` : ""}`
        : "error: the preview failed";
      log([head, ...result.diagnostics.map((d) => `  ${formatDiagnostic(d)}`)].join("\n"));
    }
    emit();
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
        if (path === "/api/events") {
          let client: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              client = controller;
              clients.add(client);
              send(client);
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

  let timer: ReturnType<typeof setTimeout> | undefined;
  cleanup.push(() => clearTimeout(timer));
  let readVersion = 0;
  const changed = () => {
    const version = ++readVersion;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      let text: string;
      try {
        text = await Bun.file(xmlPath).text();
        if (closed || version !== readVersion) return;
      } catch {
        return;
      }
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
    }, 100);
  };
  try {
    if (xmlPath.startsWith("/mnt/")) {
      watchFile(xmlPath, { interval: 500 }, changed);
      cleanup.push(() => unwatchFile(xmlPath, changed));
    } else {
      const watcher = watch(dirname(xmlPath), (_event, name) => {
        if (name === null || name.toString() === basename(xmlPath)) changed();
      });
      cleanup.push(() => watcher.close());
    }
  } catch (e) {
    close();
    throw e;
  }

  let child: Bun.Subprocess | undefined;
  let pause: ReturnType<typeof setTimeout> | undefined;
  cleanup.push(() => {
    clearTimeout(pause);
    child?.kill("SIGTERM");
  });
  if (opts.run) {
    const [shell, args] = process.platform === "win32" ? ["cmd", ["/C", opts.run]] : ["sh", ["-c", opts.run]];
    const env = { ...process.env, BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD: process.env.BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD ?? "1" };
    try {
      const proc = Bun.spawn([shell, ...args], {
        cwd: root,
        env,
        stdin: "ignore",
        stdout: "inherit",
        stderr: "pipe",
        onExit(_proc, code, signal) {
          if (!closed) console.error(`\`${opts.run}\` exited (${signal ?? code})`);
        },
      });
      child = proc;
      void (async () => {
        let text = "";
        let since = writes;
        const decoder = new TextDecoder();
        for await (const chunk of proc.stderr) {
          process.stderr.write(chunk);
          if (writes !== since) {
            text = "";
            since = writes;
          }
          text += Bun.stripANSI(decoder.decode(chunk, { stream: true }));
          clearTimeout(pause);
          pause = setTimeout(() => {
            if (!closed && writes === since && text.trim()) {
              scriptError = text;
              emit();
            }
          }, 150);
        }
      })().catch((e: unknown) => {
        scriptError = String(e);
        emit();
      });
    } catch (e) {
      scriptError = (e as Error).message;
      emit();
    }
  }

  compiler.update(xml, current.version);
  return { url, close };
};
