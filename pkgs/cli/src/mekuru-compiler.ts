#!/usr/bin/env bun

import { findCompiler } from "./compiler.ts";

try {
  const child = Bun.spawn([findCompiler(), ...Bun.argv.slice(2)], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.exit(await child.exited);
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
