#!/usr/bin/env bun
import { exportPsd } from "./psd.ts";
const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log("Usage: mekuru-psd <input.psd> --out <directory>");
} else if (args.length !== 3 || args[1] !== "--out") {
  console.error("Usage: mekuru-psd <input.psd> --out <directory>");
  process.exitCode = 1;
} else {
  try {
    const result = await exportPsd(args[0], args[2]);
    console.log(`Exported ${result.layers.length} groups/fixed layers to ${args[2]}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
