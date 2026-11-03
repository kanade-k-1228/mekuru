import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const EXE = process.platform === "win32" ? "mekuru-compiler.exe" : "mekuru-compiler";
const ENV = "MEKURU_COMPILER";

// Alpine and other musl Linux get the -musl package; detected like napi-rs does
const isMusl = () => {
  if (process.platform !== "linux") return false;
  try {
    return readFileSync("/usr/bin/ldd", "utf8").includes("musl");
  } catch {
    // without ldd, glibc still reports its version
    return !process.report?.getReport?.().header?.glibcVersionRuntime;
  }
};

const platformPackage = () => `@mekuru/core-${process.platform}-${process.arch}${isMusl() ? "-musl" : ""}`;

const fromPlatformPackage = (pkg) => {
  try {
    const path = join(dirname(require.resolve(`${pkg}/package.json`)), "bin", EXE);
    return existsSync(path) ? path : undefined;
  } catch {
    return undefined;
  }
};

const fromRepository = () => {
  const target = join(here, "..", "..", "..", "target");
  return ["debug", "release"]
    .map((p) => join(target, p, EXE))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
};

export const findCompiler = () => {
  const env = process.env[ENV];
  if (env) {
    if (!existsSync(env)) throw new Error(`${ENV} points to ${env}, which does not exist`);
    return env;
  }
  const pkg = platformPackage();
  const found = fromPlatformPackage(pkg) ?? fromRepository();
  if (found) return found;
  throw new Error(
    `mekuru-compiler for ${pkg.slice("@mekuru/core-".length)} is not installed.\n` +
      `  - reinstall the packages (\`bun install\`) so that ${pkg} is installed, or\n` +
      `  - build it from the Mekuru Movie Maker repository (\`cargo build --locked\`)\n` +
      `    and set ${ENV} to the binary`,
  );
};
