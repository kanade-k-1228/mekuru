import { expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findCompiler } from "../npm/compiler.js";
import { startServer } from "../../../scripts/fixtures/native-server.ts";

test("native serve rejects invalid options and reports a missing XML file", async () => {
  for (const args of [
    ["missing.xml", "--serve", "--port", "65536"],
    ["missing.xml", "--serve", "--emit-preview"],
    ["missing.xml", "--run", "echo test"],
    ["missing.xml", "--serve", "--no-open"],
  ]) {
    const child = Bun.spawn([findCompiler(), ...args], { stdout: "ignore", stderr: "pipe" });
    const error = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(error).toContain("error:");
  }
});

test("--run creates a missing XML file using the explicit project root", async () => {
  const root = await mkdtemp(join(tmpdir(), "mekuru-native-run-"));
  const project = join(root, "project space");
  await mkdir(project);
  const xml = join(root, "output/scene.xml");
  const script = join(root, "write script.cjs");
  const source = '<mekuru><seq><dur len="30"><text>Created by script</text></dur></seq></mekuru>';
  await Bun.write(join(project, "asset.txt"), "explicit project root");
  await Bun.write(
    script,
    `const fs = require('fs'); fs.writeFileSync(${JSON.stringify(xml)}, ${JSON.stringify(source)}); fs.writeFileSync('cwd.txt', process.cwd());`,
  );
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    // Generated paths contain no shell metacharacters; double quotes also support Windows paths with spaces.
    server = await startServer({ xml, port: 0, root: project, run: `"${process.execPath}" "${script}"` });
    const deadline = Date.now() + 4000;
    for (;;) {
      const preview = await fetch(`${server.url}/api/preview`);
      if (preview.ok && JSON.stringify(await preview.json()).includes("Created by script")) break;
      if (Date.now() > deadline) throw new Error(`script XML was not compiled: ${await (await fetch(`${server.url}/api/state`)).text()}`);
      await Bun.sleep(10);
    }
    expect(await Bun.file(join(project, "cwd.txt")).text()).toBe(await realpath(project));
    expect(await (await fetch(`${server.url}/files/asset.txt`)).text()).toBe("explicit project root");
    await expect(startServer({ xml, port: Number(new URL(server.url).port) })).rejects.toThrow("cannot listen");
  } finally {
    server?.close();
    await server?.exited;
    await rm(root, { recursive: true, force: true });
  }
});
