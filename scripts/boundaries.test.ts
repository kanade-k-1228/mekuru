import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

test("workspace dependencies are acyclic and packages use declared public imports", async () => {
  const root = join(import.meta.dir, "../pkgs");
  const packages = new Map<
    string,
    { dir: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
  >();
  for (const dir of await readdir(root)) {
    const file = Bun.file(join(root, dir, "package.json"));
    if (await file.exists()) {
      const p = await file.json();
      packages.set(p.name, { ...p, dir });
    }
  }
  const active = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string) => {
    expect(active.has(name), `dependency cycle: ${[...active, name].join(" → ")}`).toBe(false);
    if (done.has(name)) return;
    active.add(name);
    const p = packages.get(name);
    for (const dep of Object.keys({ ...p?.dependencies, ...p?.peerDependencies })) if (packages.has(dep)) visit(dep);
    active.delete(name);
    done.add(name);
  };
  for (const [name, pkg] of packages) {
    visit(name);
    const allowed = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, [name]: "self" };
    const glob = new Bun.Glob("src/**/*.{ts,tsx}");
    for await (const path of glob.scan(join(root, pkg.dir))) {
      const code = await Bun.file(join(root, pkg.dir, path)).text();
      for (const match of code.matchAll(/(?:from\s*|import\s*)["'](@mekuru\/[^"']+)["']/g)) {
        const spec = match[1];
        const dep = spec.split("/").slice(0, 2).join("/");
        expect(dep in allowed, `${name}: undeclared ${spec}`).toBe(true);
        expect(spec.includes("/src/"), `${name}: private import ${spec}`).toBe(false);
      }
    }
  }
});
