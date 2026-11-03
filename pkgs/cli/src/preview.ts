import { lineReader } from "./lines.ts";
import { acceptPreview, type SharedPreview } from "./share.ts";
import { findCompiler } from "./compiler.ts";
import type { WorkerCompilation, WorkerRequest } from "@mekuru/protocol";

/** One resident worker, one request in flight, and only the newest pending input. */
export const previewCompiler = (root: string, publish: (version: number, result: WorkerCompilation | Error, preview: SharedPreview | null) => void) => {
  let child: ReturnType<typeof spawn> | undefined;
  let closed = false;
  let running = false;
  let pending: { xml: string; version: number } | undefined;
  let shared: SharedPreview | null = null;
  const spawn = () => {
    const proc = Bun.spawn([findCompiler(), "-", "--preview-worker", "--root", root], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    let stderr = "";
    const errors = (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of proc.stderr) stderr = (stderr + decoder.decode(chunk, { stream: true })).slice(-16000);
    })();
    const readLine = lineReader(proc.stdout);
    return {
      proc,
      async request(request: WorkerRequest): Promise<WorkerCompilation> {
        proc.stdin.write(`${JSON.stringify(request)}\n`);
        await proc.stdin.flush();
        const line = await readLine();
        if (line === null) {
          const code = await proc.exited;
          await errors;
          throw new Error(stderr.trim() || `mekuru-compiler exited (${code})`);
        }
        const result = JSON.parse(line) as WorkerCompilation;
        if (result.version !== request.version || !Array.isArray(result.diagnostics) || !("previewVersion" in result) || !("update" in result))
          throw new Error("unexpected compiler response; rebuild or update mekuru-compiler");
        return result;
      },
    };
  };
  const next = async () => {
    if (closed || running || !pending) return;
    running = true;
    let input = pending;
    pending = undefined;
    let result: WorkerCompilation | Error;
    let candidate = shared;
    // Retry a broken process once, using the latest input if it changed meanwhile.
    for (let attempt = 0; ; attempt++) {
      try {
        child ??= spawn();
        result = await child.request({ ...input, baseVersion: shared?.preview.version ?? null });
        candidate = acceptPreview(shared, result);
        break;
      } catch (error) {
        child?.proc.kill();
        child = undefined;
        result = error instanceof Error ? error : new Error(String(error));
        if (closed || attempt === 1) break;
        if (pending) {
          input = pending;
          pending = undefined;
        }
      }
    }
    running = false;
    if (closed) return;
    if (!pending) {
      if (!(result instanceof Error)) shared = candidate;
      publish(input.version, result, shared);
    }
    void next();
  };
  return {
    update(xml: string, version: number) {
      if (!closed) {
        pending = { xml, version };
        void next();
      }
    },
    close() {
      closed = true;
      pending = undefined;
      child?.proc.kill();
    },
  };
};
