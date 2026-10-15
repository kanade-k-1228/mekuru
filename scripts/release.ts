#!/usr/bin/env bun

// The version lives only in the git tag (1.2.3, without a v). The repository keeps 0.0.0 everywhere,
// and ci.yml writes the tag's version into the files with `stamp` before building.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPkg = join(root, "pkgs/cli/package.json");
const BINARY = "mekuru-compiler";
const SCOPE = "@mekuru";
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

// the stamped version; 0.0.0 means `stamp` has not run, so nothing is built or published with it
const stamped = (): string => {
  const { version } = readJson(cliPkg);
  if (version === "0.0.0") throw new Error("the version is 0.0.0: run `release.ts stamp <tag>` first (ci.yml does this on a tag)");
  return version;
};

const stamp = (version: string): void => {
  if (!SEMVER.test(version)) throw new Error(`the tag is <major>.<minor>.<patch>[-<pre>] (no v), not ${version}`);
  for (const dir of readdirSync(join(root, "pkgs"))) {
    const path = join(root, "pkgs", dir, "package.json");
    if (!existsSync(path)) continue;
    writeJson(path, { ...readJson(path), version });
  }
  const cargoToml = join(root, "Cargo.toml");
  const toml = readFileSync(cargoToml, "utf8");
  const nextToml = toml.replace(/(\[workspace\.package\][^[]*?\nversion = )"[^"]*"/, `$1"${version}"`);
  if (nextToml === toml && !toml.includes(`version = "${version}"`)) throw new Error("no version in [workspace.package] of Cargo.toml");
  writeFileSync(cargoToml, nextToml);
  // the workspace's own crates have no `source` line in Cargo.lock
  const cargoLock = join(root, "Cargo.lock");
  const lock = readFileSync(cargoLock, "utf8");
  writeFileSync(cargoLock, lock.replace(/(\[\[package\]\]\nname = "[^"]+"\nversion = )"[^"]*"\n(?!source = )/g, `$1"${version}"\n`));
  console.log(`stamped ${version}`);
};

const pack = (platform: string, binDir: string, outDir: string): void => {
  const version = stamped();
  const [os, cpu] = platform.split("-");
  if (!os || !cpu) throw new Error(`the platform is <os>-<cpu> (such as linux-x64), not ${platform}`);
  // the folder has no scope: `compiler-linux-x64` holds @mekuru/compiler-linux-x64
  const folder = `compiler-${platform}`;
  const name = `${SCOPE}/${folder}`;
  const dir = join(outDir, folder);
  const exe = os === "win32" ? `${BINARY}.exe` : BINARY;
  mkdirSync(join(dir, "bin"), { recursive: true });
  copyFileSync(join(binDir, exe), join(dir, "bin", exe));
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
  writeJson(join(dir, "package.json"), pkg);
  writeFileSync(
    join(dir, "README.md"),
    `# ${name}\n\nThe prebuilt ${BINARY} of [Mekuru Movie Maker](https://www.npmjs.com/package/@mekuru/core) for ${platform}. Install \`@mekuru/cli\` instead.\n`,
  );
  console.log(`packed ${dir}`);
};

const deps = (outDir: string): void => {
  const version = stamped();
  const pkg = readJson(cliPkg);
  const names = readdirSync(outDir)
    .filter((n) => n.startsWith("compiler-"))
    .sort()
    .map((n) => `${SCOPE}/${n}`);
  if (names.length === 0) throw new Error(`no compiler-<platform> packages in ${outDir}`);
  pkg.optionalDependencies = Object.fromEntries(names.map((n) => [n, version]));
  writeJson(cliPkg, pkg);
  console.log(`added ${names.length} platform packages to pkgs/cli/package.json`);
};

// publishes each folder's package; skips private ones and versions already on npm, so a failed run can be re-run
const publish = async (dirs: string[]): Promise<void> => {
  stamped();
  for (const dir of dirs) {
    const path = join(dir, "package.json");
    if (!existsSync(path)) continue;
    const { name, version, private: isPrivate } = readJson(path);
    if (isPrivate) continue;
    if (version === "0.0.0") throw new Error(`${name} is 0.0.0`);
    const res = await fetch(`https://registry.npmjs.org/${name}/${version}`);
    if (res.ok) {
      console.log(`skip ${name}@${version} (published)`);
      continue;
    }
    const tag = version.includes("-") ? "next" : "latest";
    const proc = Bun.spawnSync(["bun", "publish", "--access", "public", "--tag", tag], { cwd: dir, stdout: "inherit", stderr: "inherit" });
    if (proc.exitCode !== 0) throw new Error(`failed to publish ${name}@${version}`);
  }
};

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "stamp" && args.length === 1) stamp(args[0]);
else if (cmd === "pack" && args.length === 3) pack(args[0], args[1], args[2]);
else if (cmd === "deps" && args.length === 1) deps(args[0]);
else if (cmd === "publish" && args.length > 0) await publish(args);
else {
  console.error("usage: release.ts stamp <tag> | pack <os>-<cpu> <bin-dir> <out-dir> | deps <out-dir> | publish <dir>...");
  process.exit(2);
}
