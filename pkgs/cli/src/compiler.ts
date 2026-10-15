import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const EXE = process.platform === "win32" ? "mekuru-compiler.exe" : "mekuru-compiler";
const PKG = `@mekuru/compiler-${process.platform}-${process.arch}`;
const ENV = "MEKURU_COMPILER";

const fromPlatformPackage = (): string | undefined => {
  try {
    const path = join(dirname(Bun.resolveSync(`${PKG}/package.json`, import.meta.dir)), "bin", EXE);
    return existsSync(path) ? path : undefined;
  } catch {
    return undefined;
  }
};

const fromRepository = (): string | undefined => {
  const target = join(import.meta.dir, "..", "..", "..", "target");
  return ["debug", "release"]
    .map((p) => join(target, p, EXE))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
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
      `  - build it from the Mekuru Movie Maker repository (\`cargo build --locked\`)\n` +
      `    and set ${ENV} to the binary`,
  );
};
