import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXE = process.platform === "win32" ? "mekuru-compiler.exe" : "mekuru-compiler";
const PKG = `@mekuru/compiler-${process.platform}-${process.arch}`;
const ENV = "MEKURU_COMPILER";

const fromPlatformPackage = (): string | undefined => {
  try {
    const path = join(dirname(createRequire(import.meta.url).resolve(`${PKG}/package.json`)), "bin", EXE);
    return existsSync(path) ? path : undefined;
  } catch {
    return undefined;
  }
};

const fromRepository = (): string | undefined => {
  const target = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "target");
  return ["release", "debug"].map((p) => join(target, p, EXE)).find((p) => existsSync(p));
};

export const findCompiler = (): string => {
  const env = process.env[ENV];
  if (env) {
    if (!existsSync(env)) throw new Error(`${ENV} points to ${env}, which does not exist`);
    return env;
  }
  const found = fromPlatformPackage() ?? fromRepository();
  if (found) return found;
  throw new Error(
    `mekuru-compiler for ${process.platform}-${process.arch} is not installed.\n` +
      `  - reinstall the packages (\`bun install\`) so that ${PKG} is installed, or\n` +
      `  - build it from the Mekuru Movie Maker repository (\`cargo build --release\`)\n` +
      `    and set ${ENV} to the binary`,
  );
};
