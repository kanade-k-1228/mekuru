import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot, toXml, writeXml } from "@mekuru/tsx";
import { Audio, type AudioSource } from "@mekuru/audio";
import { prepare } from "@mekuru/speech";
import { wav } from "../../audio/test/fixture.ts";
import { portrait, Subtitle } from "../src/index.tsx";

test("one prepared source drives speech, portraits and subtitles in both passes, independent of cwd changes", async () => {
  const before = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), "mekuru-composition-"));
  const other = join(dir, "other");
  const ready = Promise.withResolvers<void>();
  let writing: Promise<void> | undefined;
  try {
    await mkdir(join(dir, "actor"), { recursive: true });
    await mkdir(other);
    // XML generation needs metadata and WAV samples, but no image decoding.
    await Bun.write(
      join(dir, "actor", "portrait.json"),
      JSON.stringify({
        width: 1,
        height: 1,
        layers: [{ name: "mouth", kind: "lip", initial: "normal", options: [{ name: "normal", frames: ["closed.png", "open.png"] }] }],
      }),
    );
    process.chdir(dir);
    const actor = portrait({ src: "actor", blink: false });
    const sources: AudioSource[] = [];
    const roots: string[] = [];
    let syntheses = 0;
    let expansions = 0;
    const Words = () => {
      expansions++;
      return <>{"漢字\n 次"}</>;
    };
    const synthesize = async (say: string, out: string) => {
      syntheses++;
      expect(say).toBe("かんじ 次");
      await ready.promise;
      await Bun.write(out, wav(new Array(2400).fill(12000), 4800)); // half a second
    };
    const Narrator = async () => {
      roots.push(projectRoot());
      const line = await prepare("fixture", { text: <Words />, reading: { 漢字: "かんじ" }, gap: 3 }, "actor", {}, synthesize);
      sources.push(line.audio);
      expect(Object.isFrozen(line)).toBe(true);
      expect(Object.isFrozen(line.audio)).toBe(true);
      return (
        <dur len={line.audio.len}>
          <stack>
            {/* biome-ignore lint/complexity/noUselessFragments: verify transparent wrappers */}
            <>
              <Audio source={line.audio} />
            </>
            <actor.Talk source={line.audio} />
            <Subtitle text={line.display} />
          </stack>
        </dur>
      );
    };
    const file = join(dir, "video.xml");
    writing = writeXml(
      "video.xml",
      <mekuru>
        <Narrator />
      </mekuru>,
    );
    for (let i = 0; i < 200 && !(await Bun.file(file).exists()); i++) await Bun.sleep(5);
    const draft = await Bun.file(file).text();
    expect(draft).toContain('draft="true"');
    expect(draft).toContain('text="漢字&#10;次"/>');
    process.chdir(other);
    ready.resolve();
    await writing;
    const final = await Bun.file(file).text();
    expect(final).not.toContain('draft="true"');
    expect(final).toContain('<dur len="18">');
    expect(final).toContain('src=".mekuru/cache/tts/');
    expect(final.match(/<audio\b/g)).toHaveLength(1);
    expect(final).toContain('text="漢字&#10;次"/>');
    expect(sources.map((s) => s.status)).toEqual(["draft", "ready"]);
    expect(roots).toEqual([dir, dir]);
    expect(expansions).toBe(2); // once per pass, shared by all three consumers
    expect(syntheses).toBe(1);

    // A new build captures its own root, even though speech was imported before either build.
    const next = await toXml(
      <mekuru>
        <Narrator />
      </mekuru>,
    );
    expect(next).toContain('src=".mekuru/cache/tts/');
    expect(roots[2]).toBe(other);
    expect(syntheses).toBe(2);
  } finally {
    ready.resolve();
    await writing?.catch(() => {});
    process.chdir(before);
    await rm(dir, { recursive: true, force: true });
  }
});
