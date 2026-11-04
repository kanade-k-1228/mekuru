#!/usr/bin/env bun
import { convertPsd, inspectPsd } from "./psd-convert.ts";
const usage = "Usage: mekuru-psd-convert <input.psd> --inspect\n       mekuru-psd-convert <input.psd> --map <mapping.json> --out <character.psd>";
const args = process.argv.slice(2);
try {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) console.log(usage);
  else if (args.length === 2 && args[1] === "--inspect") console.log(JSON.stringify(await inspectPsd(args[0]), null, 2));
  else if (args.length === 5 && args[1] === "--map" && args[3] === "--out") {
    await convertPsd(args[0], args[4], await Bun.file(args[2]).json());
    console.log(`Converted to ${args[4]}`);
  } else {
    console.error(usage);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
