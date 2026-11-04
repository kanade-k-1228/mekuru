#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { convertPsd, inspectPsd } from "./psd-convert.ts";
import { exportPsd } from "./psd.ts";

const usage = `Usage: mekuru-psd <input.psd> --out <dir>                            export portrait PNGs, portrait.json and portrait.d.ts
       mekuru-psd <input.psd> --inspect                              print the layer tree as JSON, for writing a mapping
       mekuru-psd <input.psd> --map <mapping.json> --out <out.psd>   convert a PSD with other conventions into a Mekuru PSD`;

try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { out: { type: "string" }, map: { type: "string" }, inspect: { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });
  const { out, map, inspect, help } = values;
  const [input, ...extra] = positionals;
  if (help) console.log(usage);
  else if (input === undefined || extra.length) throw new Error(usage);
  else if (inspect && !out && !map) console.log(JSON.stringify(await inspectPsd(input), null, 2));
  else if (inspect || !out) throw new Error(usage);
  else if (map) {
    await convertPsd(input, out, await Bun.file(map).json());
    console.log(`Converted ${input} to ${out}. Export it with: mekuru-psd ${out} --out <dir>`);
  } else console.log(`Exported ${(await exportPsd(input, out)).layers.length} portrait parts to ${out}`);
} catch (error) {
  const { message = String(error), code } = error as { message?: string; code?: string };
  console.error(code?.startsWith("ERR_PARSE_ARGS") ? `${message}\n\n${usage}` : message);
  process.exitCode = 1;
}
