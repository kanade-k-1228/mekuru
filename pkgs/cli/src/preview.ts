import { findCompiler } from "./compiler.ts";
import type { Compilation } from "./protocol.ts";

export const previewCompiler = (root: string, publish: (version: number, result: Compilation | Error) => void) => {
  let child: Bun.Subprocess | undefined;
  let closed = false;
  let pending: { xml: string; version: number } | undefined;
  const next = async () => {
    if (closed || child || !pending) return;
    const { xml, version } = pending;
    pending = undefined;
    let result: Compilation | Error;
    try {
      const proc = Bun.spawn([findCompiler(), "-", "--emit-preview", "--root", root], {
        stdin: new Blob([xml]),
        stdout: "pipe",
        stderr: "pipe",
      });
      child = proc;
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      if (code !== 0) throw new Error(stderr.slice(-16000).trim() || `mekuru-compiler exited (${code})`);
      result = JSON.parse(stdout) as Compilation;
      if (!Array.isArray(result.diagnostics) || !("preview" in result)) throw new Error("unexpected compiler response; rebuild or update mekuru-compiler");
    } catch (e) {
      result = e instanceof Error ? e : new Error(String(e));
    } finally {
      child = undefined;
    }
    if (closed) return;
    if (!pending) publish(version, result);
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
      child?.kill();
    },
  };
};
