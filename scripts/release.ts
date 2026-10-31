#!/usr/bin/env bun

// The version lives only in the git tag (1.2.3, without a v). The repository keeps 0.0.0 everywhere,
// and ci.yml writes the tag's version into the files with `stamp` before building.

import { chmodSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = join(import.meta.dir, "..");
const cliPkg = join(root, "pkgs/cli/package.json");
const BINARY = "mekuru-compiler";
const SCOPE = "@mekuru";
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const readJson = (path: string) => Bun.file(path).json();
const writeJson = (path: string, value: unknown) => Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);

// the stamped version; 0.0.0 means `stamp` has not run, so nothing is built or published with it
const stamped = async (): Promise<string> => {
  const { version } = await readJson(cliPkg);
  if (version === "0.0.0") throw new Error("the version is 0.0.0: run `release.ts stamp <tag>` first (ci.yml does this on a tag)");
  return version;
};

const stamp = async (version: string): Promise<void> => {
  if (!SEMVER.test(version)) throw new Error(`the tag is <major>.<minor>.<patch>[-<pre>] (no v), not ${version}`);
  if (version === "0.0.0") throw new Error("0.0.0 is reserved for development");
  for (const dir of readdirSync(join(root, "pkgs"))) {
    const path = join(root, "pkgs", dir, "package.json");
    if (!(await Bun.file(path).exists())) continue;
    await writeJson(path, { ...(await readJson(path)), version });
  }
  const cargoToml = join(root, "Cargo.toml");
  const toml = await Bun.file(cargoToml).text();
  const nextToml = toml.replace(/(\[workspace\.package\][^[]*?\r?\nversion = )"[^"]*"/, `$1"${version}"`);
  if (nextToml === toml && !toml.includes(`version = "${version}"`)) throw new Error("no version in [workspace.package] of Cargo.toml");
  await Bun.write(cargoToml, nextToml);
  // the workspace's own crates have no `source` line in Cargo.lock
  const cargoLock = join(root, "Cargo.lock");
  const lock = await Bun.file(cargoLock).text();
  await Bun.write(cargoLock, lock.replace(/(\[\[package\]\]\r?\nname = "[^"]+"\r?\nversion = )"[^"]*"(\r?\n)(?!source = )/g, `$1"${version}"$2`));
  console.log(`stamped ${version}`);
};

const pack = async (platform: string, binDir: string, outDir: string): Promise<void> => {
  const version = await stamped();
  const [os, cpu] = platform.split("-");
  if (!os || !cpu) throw new Error(`the platform is <os>-<cpu> (such as linux-x64), not ${platform}`);
  // the folder has no scope: `compiler-linux-x64` holds @mekuru/compiler-linux-x64
  const folder = `compiler-${platform}`;
  const name = `${SCOPE}/${folder}`;
  const dir = join(outDir, folder);
  const exe = os === "win32" ? `${BINARY}.exe` : BINARY;
  await Bun.write(join(dir, "bin", exe), Bun.file(join(binDir, exe)));
  if (os !== "win32") chmodSync(join(dir, "bin", exe), 0o755);
  const pkg = {
    name,
    version,
    description: `The compiler of Mekuru Movie Maker (XML → video) for ${platform}; installed by the @mekuru/cli package`,
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/kanade-k-1228/sasara.git" },
    os: [os],
    cpu: [cpu],
    files: ["bin"],
    preferUnplugged: true,
  };
  await writeJson(join(dir, "package.json"), pkg);
  await Bun.write(
    join(dir, "README.md"),
    `# ${name}\n\nThe prebuilt ${BINARY} of [Mekuru Movie Maker](https://www.npmjs.com/package/@mekuru/core) for ${platform}. Install \`@mekuru/cli\` instead.\n`,
  );
  // Artifact uploads discard executable permissions; the npm tarball preserves them.
  await $`${process.execPath} pm pack --filename ${resolve(outDir, `${folder}.tgz`)}`.cwd(dir);
};

const deps = async (outDir: string): Promise<void> => {
  const version = await stamped();
  const pkg = await readJson(cliPkg);
  const names = readdirSync(outDir)
    .filter((n) => n.startsWith("compiler-") && n.endsWith(".tgz"))
    .sort()
    .map((n) => `${SCOPE}/${n.slice(0, -4)}`);
  if (names.length === 0) throw new Error(`no compiler-<platform>.tgz packages in ${outDir}`);
  pkg.optionalDependencies = Object.fromEntries(names.map((n) => [n, version]));
  await writeJson(cliPkg, pkg);
  console.log(`added ${names.length} platform packages to pkgs/cli/package.json`);
};

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "stamp" && args.length === 1) await stamp(args[0]);
else if (cmd === "pack" && args.length === 3) await pack(args[0], args[1], args[2]);
else if (cmd === "deps" && args.length === 1) await deps(args[0]);
else {
  console.error("usage: release.ts stamp <tag> | pack <os>-<cpu> <bin-dir> <out-dir> | deps <out-dir>");
  process.exit(2);
}
