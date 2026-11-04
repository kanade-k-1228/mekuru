import { packageName, keepLines } from "./template.ts";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SITE_NAMES, SITES, type Site, type Template } from "./choices.ts";

const pkgDir = join(import.meta.dir, "..");
const TEMPLATE = join(pkgDir, "template");
export const VERSION: string = (await Bun.file(join(pkgDir, "package.json")).json()).version;

export interface CreateOptions {
  force?: boolean;
  template?: Template;
  upload?: readonly Site[];
}

export const isEmptyDir = (dir: string): boolean => !existsSync(dir) || readdirSync(dir).length === 0;

export const create = async (dir: string, { force = false, template = "sample", upload = [] }: CreateOptions = {}): Promise<string> => {
  const target = resolve(dir);
  if (!isEmptyDir(target) && !force) throw new Error(`${dir} is not empty (use --force to write into it anyway)`);
  const sites = SITE_NAMES.filter((s) => upload.includes(s));
  const source = join(TEMPLATE, template);
  for (const file of readdirSync(source, { recursive: true, encoding: "utf8" })) {
    const src = join(source, file);
    if (!statSync(src).isDirectory()) await Bun.write(join(target, file === "_gitignore" ? ".gitignore" : file), Bun.file(src));
  }
  const pkgFile = join(target, "package.json");
  const pkg = await Bun.file(pkgFile).json();
  pkg.name = packageName(target);
  for (const site of sites) {
    pkg.scripts[`upload:${site}`] = SITES[site].bin;
    await Bun.write(join(target, "configs", `${site}.yaml`), SITES[site].settings(pkg.name));
  }
  const deps = [...Object.keys(pkg.devDependencies), ...sites.map((s) => SITES[s].pkg)];
  for (const name of deps) if (name.startsWith("@mekuru/")) pkg.devDependencies[name] = `^${VERSION}`;
  pkg.devDependencies = Object.fromEntries(Object.entries(pkg.devDependencies).sort(([a], [b]) => (a < b ? -1 : 1)));
  await Bun.write(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  const readme = join(target, "README.md");
  await Bun.write(readme, keepLines(await Bun.file(readme).text(), sites).replace(/^# my-video$/m, `# ${pkg.name}`));
  return target;
};
