import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { findCompiler } from "./compiler.js";
import type { Compilation } from "./protocol.js";

export const previewCompiler = (root: string, publish: (version: number, result: Compilation | Error) => void) => {
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed = false;
  let pending: { xml: string; version: number } | undefined;
  const next = () => {
    if (closed || child || !pending) return;
    const { xml, version } = pending;
    pending = undefined;
    let stdout = "";
    let stderr = "";
    try {
      child = spawn(findCompiler(), ["-", "--emit-preview", "--root", root], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      publish(version, e instanceof Error ? e : new Error(String(e)));
      return;
    }
    let failure: Error | undefined;
    child.on("error", (e) => {
      failure = e;
    });
    child.stdin.on("error", (e) => {
      failure = e;
    });
    child.stdout.setEncoding("utf8").on("data", (text: string) => {
      stdout += text;
    });
    child.stderr.setEncoding("utf8").on("data", (text: string) => {
      stderr = (stderr + text).slice(-16000);
    });
    child.on("close", (code) => {
      child = undefined;
      if (closed) return;
      let result: Compilation | Error;
      try {
        if (failure) throw failure;
        if (code !== 0) throw new Error(stderr.trim() || `mekuru-compiler exited (${code})`);
        result = JSON.parse(stdout) as Compilation;
        if (!Array.isArray(result.diagnostics) || !("preview" in result)) throw new Error("unexpected compiler response; rebuild or update mekuru-compiler");
      } catch (e) {
        result = e instanceof Error ? e : new Error(String(e));
      }
      if (!pending) publish(version, result);
      next();
    });
    child.stdin.end(xml);
  };
  return {
    update(xml: string, version: number) {
      if (!closed) {
        pending = { xml, version };
        next();
      }
    },
    close() {
      closed = true;
      pending = undefined;
      child?.kill();
    },
  };
};
