#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { findCompiler } from "./compiler.js";

let path: string;
try {
  path = findCompiler();
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
const child = spawn(path, process.argv.slice(2), { stdio: "inherit" });
const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("error", (e) => {
  console.error(`error: cannot run ${path}: ${e.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 130 : 1)));
