import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
const version = "0.3.0-rc.1";
const exe = process.platform === "win32" ? "mekuru-compiler.exe" : "mekuru-compiler";
const platform = `${process.platform}-${process.arch}`;
const read = (path: string) => Bun.file(join(root, path));
const write = (path: string, value: unknown) => Bun.write(join(root, path), JSON.stringify(value));
const run = async (...args: string[]) => {
  const child = Bun.spawn([process.execPath, "scripts/release.ts", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(stdout + stderr);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mekuru-release-"));
  await Bun.write(join(root, "scripts/release.ts"), Bun.file(new URL("release.ts", import.meta.url)));
  await write("pkgs/cli/package.json", { name: "@mekuru/cli", version: "0.0.0" });
  await write("pkgs/core/package.json", { name: "@mekuru/core", version: "0.0.0" });
  await Bun.write(join(root, "Cargo.toml"), '[workspace.package]\nversion = "0.0.0"\n');
  await Bun.write(
    join(root, "Cargo.lock"),
    '[[package]]\nname = "mekuru-compiler"\nversion = "0.0.0"\n\n[[package]]\nname = "dependency"\nversion = "1.0.0"\nsource = "registry+https://example.invalid"\n',
  );
  await Bun.write(join(root, "bin", exe), "compiler fixture");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("stamps package and Cargo versions without changing registry dependencies", async () => {
  await run("stamp", version);
  expect((await read("pkgs/core/package.json").json()).version).toBe(version);
  expect((await read("pkgs/cli/package.json").json()).version).toBe(version);
  expect(await read("Cargo.toml").text()).toContain(`version = "${version}"`);
  expect(await read("Cargo.lock").text()).toContain(`name = "mekuru-compiler"\nversion = "${version}"`);
  expect(await read("Cargo.lock").text()).toContain('name = "dependency"\nversion = "1.0.0"');
});

test("packs an executable npm tarball and adds the downloaded packages as optional dependencies", async () => {
  await run("stamp", version);
  await run("pack", platform, "bin", "npm-out");
  const archive = new Bun.Archive(await read(`npm-out/compiler-${platform}.tgz`).arrayBuffer());
  await archive.extract(join(root, "downloaded"));
  const pkg = await read("downloaded/package/package.json").json();
  expect(pkg).toMatchObject({ name: `@mekuru/compiler-${platform}`, version, os: [process.platform], cpu: [process.arch] });
  const binary = read(`downloaded/package/bin/${exe}`);
  expect(await binary.text()).toBe("compiler fixture");
  if (process.platform !== "win32") expect((await binary.stat()).mode & 0o111).toBe(0o111);
  await run("deps", "npm-out");
  expect((await read("pkgs/cli/package.json").json()).optionalDependencies).toEqual({ [`@mekuru/compiler-${platform}`]: version });
});

test("rejects an unstamped release and the development tag before preparing artifacts", async () => {
  await expect(run("stamp", "0.0.0")).rejects.toThrow("reserved for development");
  await expect(run("stamp", "v0.3.0")).rejects.toThrow("no v");
  await expect(run("pack", platform, "bin", "npm-out")).rejects.toThrow("run `release.ts stamp");
  expect((await read("pkgs/cli/package.json").json()).version).toBe("0.0.0");
});
