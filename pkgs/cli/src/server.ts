import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, unwatchFile, watch, watchFile } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { previewCompiler } from "./preview.js";
import type { Diagnostic, StateDto } from "./protocol.js";

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

const VIEWER = join(dirname(fileURLToPath(import.meta.url)), "..", "viewer");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
};

const NOT_BUILT = `<!doctype html><meta charset=utf-8><title>Mekuru Movie Maker</title><body style="font-family:sans-serif;padding:2em"><h1>Mekuru Movie Maker</h1><p>The viewer is not built.</p><pre>bun install\nbun run --filter @mekuru/viewer build</pre>`;

// biome-ignore lint/suspicious/noControlCharactersInRegex: matches the ESC of ANSI escape codes
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

const log = (line: string) => process.stderr.write(`${new Date().toTimeString().slice(0, 8)} ${line}\n`);
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`;
const formatDiagnostic = (d: Diagnostic) => `L${d.line} ${d.code}: ${d.message}`;

const sendFile = (req: IncomingMessage, res: ServerResponse, path: string): void => {
  let size: number;
  try {
    const st = statSync(path);
    if (!st.isFile()) throw new Error("not a file");
    size = st.size;
  } catch {
    res.writeHead(404).end();
    return;
  }
  const headers = { "content-type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream", "accept-ranges": "bytes", "cache-control": "no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      res.writeHead(416, { "content-range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") res.end();
    else createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "content-length": size });
  if (req.method === "HEAD") res.end();
  else createReadStream(path).pipe(res);
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
  const attempt = (i: number) => {
    if (i >= tries.length) return;
    const [cmd, ...args] = tries[i];
    const child = spawn(cmd, [...args, url], { stdio: "ignore", detached: true, cwd: wsl ? "/mnt/c" : undefined });
    child.on("error", () => attempt(i + 1));
    child.unref();
  };
  attempt(0);
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
  if (existsSync(xmlPath)) xml = readFileSync(xmlPath, "utf8");
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
  const clients = new Set<ServerResponse>();
  const send = (res: ServerResponse) => res.write(`event: state\ndata: ${JSON.stringify(current)}\n\n`);
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

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/api/state") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(current));
    } else if (path === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      send(res);
      clients.add(res);
      req.on("close", () => clients.delete(res));
    } else if (path.startsWith("/files/")) {
      const file = inside(root, path.slice("/files/".length));
      if (file) sendFile(req, res, file);
      else res.writeHead(404).end();
    } else if (path.startsWith("/api/")) {
      res.writeHead(404).end();
    } else if (!existsSync(join(VIEWER, "index.html"))) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(NOT_BUILT);
    } else {
      const file = inside(VIEWER, path === "/" ? "index.html" : path.slice(1));
      sendFile(req, res, file && existsSync(file) && statSync(file).isFile() ? file : join(VIEWER, "index.html"));
    }
  });
  cleanup.push(() => {
    for (const c of clients) c.end();
    server.close();
    server.closeAllConnections();
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", (e: NodeJS.ErrnoException) =>
      fail(e.code === "EADDRINUSE" ? new Error(`cannot listen on 127.0.0.1:${opts.port} (is the port in use? try --port)`) : e),
    );
    server.listen(opts.port, "127.0.0.1", () => ok());
  }).catch((e: unknown) => {
    close();
    throw e;
  });
  const address = server.address();
  const url = `http://localhost:${typeof address === "object" && address ? address.port : opts.port}`;
  const keepAlive = setInterval(() => {
    for (const c of clients) c.write(": keep-alive\n\n");
  }, 15_000);
  cleanup.push(() => clearInterval(keepAlive));

  let timer: ReturnType<typeof setTimeout> | undefined;
  cleanup.push(() => clearTimeout(timer));
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      let text: string;
      try {
        text = readFileSync(xmlPath, "utf8");
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

  let child: ChildProcess | undefined;
  let pause: ReturnType<typeof setTimeout> | undefined;
  cleanup.push(() => {
    clearTimeout(pause);
    child?.kill("SIGTERM");
  });
  if (opts.run) {
    const [shell, args] = process.platform === "win32" ? ["cmd", ["/C", opts.run]] : ["sh", ["-c", opts.run]];
    const env = { ...process.env, BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD: process.env.BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD ?? "1" };
    const proc = spawn(shell, args, { cwd: root, env, stdio: ["ignore", "inherit", "pipe"] });
    child = proc;
    proc.on("error", (e) => {
      scriptError = e.message;
      emit();
    });
    proc.on("exit", (code, signal) => {
      if (!closed) console.error(`\`${opts.run}\` exited (${signal ?? code})`);
    });
    let text = "";
    let since = writes;
    proc.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      if (writes !== since) {
        text = "";
        since = writes;
      }
      text += stripAnsi(chunk.toString("utf8"));
      clearTimeout(pause);
      pause = setTimeout(() => {
        if (!closed && writes === since && text.trim()) {
          scriptError = text;
          emit();
        }
      }, 150);
    });
  }

  compiler.update(xml, current.version);
  return { url, close };
};
