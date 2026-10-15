import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exe = process.platform === "win32" ? "mekuru-compiler.exe" : "mekuru-compiler";
let root: string;
let findCompiler: () => string;
let previousOverride: string | undefined;

beforeEach(async () => {
  previousOverride = process.env.MEKURU_COMPILER;
  delete process.env.MEKURU_COMPILER;
  root = mkdtempSync(join(tmpdir(), "mekuru-compiler-test-"));
  const source = join(root, "pkgs/cli/src/compiler.ts");
  mkdirSync(join(root, "pkgs/cli/src"), { recursive: true });
  await Bun.write(source, Bun.file(new URL("../src/compiler.ts", import.meta.url)));
  ({ findCompiler } = await import(Bun.pathToFileURL(source).href));
});

afterEach(() => {
  if (previousOverride === undefined) delete process.env.MEKURU_COMPILER;
  else process.env.MEKURU_COMPILER = previousOverride;
  rmSync(root, { recursive: true, force: true });
});

const binary = async (profile: string, modified: number): Promise<string> => {
  const dir = join(root, "target", profile);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, exe);
  await Bun.write(path, "fixture");
  utimesSync(path, modified, modified);
  return path;
};

test("uses the latest repository build when switching between debug and release", async () => {
  const release = await binary("release", 100);
  const debug = await binary("debug", 200);
  expect(findCompiler()).toBe(debug);
  utimesSync(release, 300, 300);
  expect(findCompiler()).toBe(release);
});

test("uses the only available repository build", async () => {
  expect(findCompiler).toThrow("is not installed");
  const release = await binary("release", 100);
  expect(findCompiler()).toBe(release);
});

test("an explicit compiler overrides repository builds and must exist", async () => {
  const release = await binary("release", 100);
  await binary("debug", 200);
  process.env.MEKURU_COMPILER = release;
  expect(findCompiler()).toBe(release);
  process.env.MEKURU_COMPILER = join(root, "missing");
  expect(findCompiler).toThrow("does not exist");
});
