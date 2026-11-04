#!/usr/bin/env node
import { spawn } from "node:child_process";
import { findCompiler } from "../npm/compiler.js";

try {
  const child = spawn(findCompiler(), process.argv.slice(2), { stdio: "inherit" });
  const stop = (signal) => child.kill(signal);
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("error", (error) => {
    console.error(`error: ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => process.exit(code ?? (signal === "SIGINT" ? 130 : 1)));
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
