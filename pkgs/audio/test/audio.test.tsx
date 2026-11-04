import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toXml } from "@mekuru/tsx";
import { Audio, readAudio } from "../src/index.tsx";
import { wav } from "./fixture.ts";

test("readAudio measures an existing WAV in frames, plus the gap, and Audio renders it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-audio-"));
  try {
    const file = join(dir, "line.wav");
    await Bun.write(file, wav(2400, 4800));
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
