import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { CHARACTER_NAMES, ENGINES, enginesOf, isCharacter, isEngine, type Character } from "./character.ts";
import { characterImport, characterSource } from "./character-source.ts";
import { isSite, SITE_NAMES, SITES, type Site } from "./site.ts";

const pkgDir = join(import.meta.dir, "..");
const TEMPLATE = join(pkgDir, "template");
export const VERSION: string = (await Bun.file(join(pkgDir, "package.json")).json()).version;

export interface CreateOptions {
  force?: boolean;
  mekuru?: string;
  characters?: readonly Character[];
  upload?: readonly Site[];
}

const packageName = (dir: string): string => {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[._-]+|-+$/g, "");
  return name || "my-video";
};

export const isEmptyDir = (dir: string): boolean => !existsSync(dir) || readdirSync(dir).length === 0;

const MARKER = /\s*(?:\/\/|<!--)\s*#if\s+(.+?)\s*(?:-->)?\s*$/;

const keepLines = (text: string, chosen: readonly string[]): string =>
  text
    .split("\n")
    .flatMap((line) => {
      const m = MARKER.exec(line);
      if (!m) return [line];
      const names = m[1].split(/\s+/);
      const unknown = names.find((n) => !isCharacter(n) && !isEngine(n) && !isSite(n));
      if (unknown !== undefined) throw new Error(`the template has #if ${unknown}: not a character, an engine or an upload site`);
      return names.some((n) => chosen.includes(n)) ? [line.slice(0, m.index)] : [];
    })
    .join("\n");

const copy = async (from: string, to: string, chosen: readonly string[]): Promise<void> => {
  for (const file of readdirSync(from, { recursive: true, encoding: "utf8" })) {
    const src = join(from, file);
    if (statSync(src).isDirectory()) continue;
    if (basename(dirname(file)) === "character") {
      const name = basename(file, extname(file));
      if (!isCharacter(name)) throw new Error(`the template has ${file}: not a character`);
      if (!chosen.includes(name)) continue;
    }
    const dest = join(to, dirname(file), basename(file) === "_gitignore" ? ".gitignore" : basename(file));
    if (![".md", ".ts", ".tsx"].includes(extname(file))) await Bun.write(dest, Bun.file(src));
    else await Bun.write(dest, keepLines(await Bun.file(src).text(), chosen));
  }
};

export const create = async (dir: string, { force = false, mekuru = `^${VERSION}`, characters = [], upload = [] }: CreateOptions = {}): Promise<string> => {
  const unknown = characters.find((c) => !isCharacter(c));
  if (unknown !== undefined) throw new Error(`unknown character ${unknown} (${CHARACTER_NAMES.join(", ")})`);
  const unknownSite = upload.find((s) => !isSite(s));
  if (unknownSite !== undefined) throw new Error(`unknown upload site ${unknownSite} (${SITE_NAMES.join(", ")})`);
  const target = resolve(dir);
  if (!isEmptyDir(target) && !force) throw new Error(`${dir} is not empty (use --force to write into it anyway)`);
  const selected = CHARACTER_NAMES.filter((id) => characters.includes(id));
  const engines = enginesOf(selected);
  const sites = SITE_NAMES.filter((s) => upload.includes(s));
  await copy(TEMPLATE, target, [...selected, ...engines, ...sites]);
  for (const id of selected) {
    const file = join(target, "src", "character", `${id}.tsx`);
    await Bun.write(file, characterSource(id));
  }
  const main = join(target, "src", "main.tsx");
  await Bun.write(main, (await Bun.file(main).text()).replace("// #characters", selected.map(characterImport).join("\n")));
  const pkgFile = join(target, "package.json");
  const pkg = await Bun.file(pkgFile).json();
  pkg.name = packageName(target);
  for (const engine of engines) pkg.devDependencies[ENGINES[engine].pkg] = `^${VERSION}`;
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
