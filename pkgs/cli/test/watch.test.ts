import { expect, test } from "bun:test";
import { appendFile, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { watchXml } from "../src/watch.ts";

test("settles chunked writes and atomic replacements, then cancels pending reads on close", async () => {
  const root = await mkdtemp(join(tmpdir(), "mekuru-watch-"));
  const path = join(root, "scene.xml");
  await Bun.write(path, "initial");
  const seen: string[] = [];
  const close = watchXml(path, (text) => seen.push(text));
  const until = async (text: string) => {
    const deadline = Date.now() + 2000;
    while (!seen.includes(text)) {
      if (Date.now() > deadline) throw new Error(`watch timed out: ${JSON.stringify(seen)}`);
      await Bun.sleep(5);
    }
  };
  try {
    await Bun.write(path, "<mekuru>");
    await Bun.sleep(5);
    await appendFile(path, "<seq/>");
    await Bun.sleep(5);
    await appendFile(path, "</mekuru>");
    await until("<mekuru><seq/></mekuru>");
    expect(seen).toEqual(["<mekuru><seq/></mekuru>"]);
    await Bun.write(join(root, "next.xml"), "replacement");
    await rename(join(root, "next.xml"), path);
    await until("replacement");
    expect(seen).toEqual(["<mekuru><seq/></mekuru>", "replacement"]);
    await Bun.write(path, "closed");
    close();
    await Bun.sleep(50);
    expect(seen).not.toContain("closed");
  } finally {
    close();
    await rm(root, { recursive: true, force: true });
  }
});
