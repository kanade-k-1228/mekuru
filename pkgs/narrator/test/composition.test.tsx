import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot, toXml, writeXml } from "@mekuru/types";
import type { AudioSource } from "@mekuru/audio";
import { prepare } from "@mekuru/speech";
import { Audio } from "@mekuru/audio";
import { readAudio } from "@mekuru/audio";
import { portrait, Subtitle } from "../src/index.tsx";

const wav = () => {
  const bytes = Buffer.alloc(44 + 4800);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(4800, 24);
  bytes.writeUInt32LE(9600, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(4800, 40);
  for (let at = 44; at < bytes.length; at += 2) bytes.writeInt16LE(12000, at);
  return bytes;
};

test("one prepared source drives speech, portraits and subtitles in both passes, independent of cwd changes", async () => {
  const before = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), "mekuru-composition-"));
  const other = join(dir, "other");
  const ready = Promise.withResolvers<void>();
  let writing: Promise<void> | undefined;
  try {
    await mkdir(join(dir, "actor", "口"), { recursive: true });
    await mkdir(other);
    // XML generation only needs the part names; no renderer or engine is involved.
    await Bun.write(join(dir, "actor", "口", "口.png"), "");
    await Bun.write(join(dir, "actor", "口", "口.0.png"), "");
    process.chdir(dir);
    const actor = portrait({ src: "actor", blink: false });
    const sources: AudioSource[] = [];
    const roots: string[] = [];
    let syntheses = 0;
    let expansions = 0;
    const Words = () => {
      expansions++;
      return (
        <>
          漢字《かんじ》
          <br /> 次
        </>
      );
    };
    const synthesize = async (say: string, out: string) => {
      syntheses++;
      expect(say).toBe("かんじ 次");
      await ready.promise;
      await Bun.write(out, wav());
    };
    const Narrator = async () => {
      roots.push(projectRoot());
      const line = await prepare("fixture", { children: <Words />, gap: 3 }, "actor", {}, synthesize);
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
            <Subtitle pre>{line.display}</Subtitle>
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
    expect(draft).toContain('pre="true">漢字<br/> 次</text>');
    process.chdir(other);
    ready.resolve();
    await writing;
    const final = await Bun.file(file).text();
    expect(final).not.toContain('draft="true"');
    expect(final).toContain('<dur len="18">');
    expect(final).toContain('src=".mekuru/cache/tts/');
    expect(final.match(/<audio\b/g)).toHaveLength(1);
    expect(final).toContain('pre="true">漢字<br/> 次</text>');
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

test("existing WAV sources have the same duration and rendering contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-audio-"));
  try {
    const file = join(dir, "line.wav");
    await Bun.write(file, wav());
    const Clip = async () => {
      const source = await readAudio(file, { gap: 2 });
      expect(source.len).toBe(14); // half a second at 24 fps, plus two frames
      return <Audio source={source} />;
    };
    const xml = await toXml(
      <mekuru fps={24}>
        <Clip />
      </mekuru>,
    );
    expect(xml).toContain('<dur len="14">');
    expect(xml.match(/<audio\b/g)).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
