import { packageName, keepLines } from "./template.ts";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { ENGINE_NAMES, ENGINES, isEngine, type Engine } from "./engine.ts";
import { isSite, SITE_NAMES, SITES, type Site } from "./site.ts";

const pkgDir = join(import.meta.dir, "..");
const TEMPLATE = join(pkgDir, "template");
export const VERSION: string = (await Bun.file(join(pkgDir, "package.json")).json()).version;

export interface CreateOptions {
  force?: boolean;
  mekuru?: string;
  engines?: readonly Engine[];
  upload?: readonly Site[];
}

export const isEmptyDir = (dir: string): boolean => !existsSync(dir) || readdirSync(dir).length === 0;

const copy = async (from: string, to: string, chosen: readonly string[]): Promise<void> => {
  for (const file of readdirSync(from, { recursive: true, encoding: "utf8" })) {
    const src = join(from, file);
    if (statSync(src).isDirectory()) continue;
    const dest = join(to, dirname(file), basename(file) === "_gitignore" ? ".gitignore" : basename(file));
    if (![".md", ".ts", ".tsx"].includes(extname(file))) await Bun.write(dest, Bun.file(src));
    else await Bun.write(dest, keepLines(await Bun.file(src).text(), chosen));
  }
};

export const create = async (dir: string, { force = false, mekuru = `^${VERSION}`, engines = [], upload = [] }: CreateOptions = {}): Promise<string> => {
  const unknown = engines.find((e) => !isEngine(e));
  if (unknown !== undefined) throw new Error(`unknown engine ${unknown} (${ENGINE_NAMES.join(", ")})`);
  const unknownSite = upload.find((s) => !isSite(s));
  if (unknownSite !== undefined) throw new Error(`unknown upload site ${unknownSite} (${SITE_NAMES.join(", ")})`);
  const target = resolve(dir);
  if (!isEmptyDir(target) && !force) throw new Error(`${dir} is not empty (use --force to write into it anyway)`);
  const selected = ENGINE_NAMES.filter((e) => engines.includes(e));
  const sites = SITE_NAMES.filter((s) => upload.includes(s));
  await copy(TEMPLATE, target, [...selected, ...sites]);
  const pkgFile = join(target, "package.json");
  const pkg = await Bun.file(pkgFile).json();
  pkg.name = packageName(target);
  for (const engine of selected) pkg.devDependencies[ENGINES[engine].pkg] = `^${VERSION}`;
  for (const site of sites) {
    pkg.devDependencies[SITES[site].pkg] = `^${VERSION}`;
    pkg.scripts[`upload:${site}`] = SITES[site].bin;
    await Bun.write(join(target, "configs", `${site}.yaml`), SITES[site].settings(pkg.name));
  }
  for (const name of Object.keys(pkg.devDependencies)) if (name.startsWith("@mekuru/")) pkg.devDependencies[name] = `^${VERSION}`;
  pkg.devDependencies["@mekuru/core"] = mekuru;
  pkg.devDependencies = Object.fromEntries(Object.entries(pkg.devDependencies).sort(([a], [b]) => (a < b ? -1 : 1)));
  await Bun.write(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  const readme = join(target, "README.md");
  await Bun.write(readme, (await Bun.file(readme).text()).replace(/^# my-video$/m, `# ${pkg.name}`));
  return target;
};
