import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDraft, toXml, waitFor, writeXml, type Node } from "@mekuru/core";
import { Subtitle, subtitleText } from "../src/index.tsx";

const render = (children: Node) => toXml(<mekuru>{children}</mekuru>);

test("subtitle defaults and native text overrides", async () => {
  const xml = await render(
    <Subtitle>
      漢字《かんじ》
      <br />
      字幕
    </Subtitle>,
  );
  expect(xml).toContain('x="50%" y="95%" anchor="b" max-w="90%" align="center" size="54" color="#FFFFFF" stroke="#000000" stroke-width="7" z="100"');
  expect(xml).toContain("漢字<br/>字幕</text>");
  const custom = await render(
    <Subtitle x={10} y={20} size={30} color="red" stroke="blue" stroke-width={2} z={5} max-w="50%" anchor="c" align="left" font="custom" id="caption" at={3}>
      text
    </Subtitle>,
  );
  expect(custom).toContain('x="10" y="20" anchor="c" max-w="50%" align="left" size="30" color="#FF0000" stroke="#0000FF" stroke-width="2" z="5"');
  expect(custom).toContain('font="custom" id="caption" delay="3"');
  expect(await render(<text>{subtitleText("｜表示《よみ》")}</text>)).toContain("<text>表示</text>");
});

test("composition keeps one speech per pass and updates draft duration with its subtitle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mekuru-narrator-"));
  const path = join(dir, "video.xml");
  const ready = Promise.withResolvers<void>();
  const calls: boolean[] = [];
  const Speech = async () => {
    await Promise.resolve();
    const draft = isDraft();
    calls.push(draft);
    if (draft) waitFor(ready.promise);
    return (
      <dur len={draft ? 30 : 60}>
        <audio draft={draft} src={draft ? undefined : "speech.wav"} />
      </dur>
    );
  };
  const Talk = ({ children }: { children: Node }) => (
    <>
      {children}
      <image src="portrait.png" />
    </>
  );
  const video = (
    <mekuru>
      <stack id="line">
        <Talk>
          <Speech />
        </Talk>
        <Subtitle>こんにちは</Subtitle>
      </stack>
    </mekuru>
  );
  const writing = writeXml(path, video);
  try {
    for (let i = 0; i < 200 && !(await Bun.file(path).exists()); i++) await Bun.sleep(5);
    const draft = await Bun.file(path).text();
    expect(draft).toContain('<dur len="30">');
    expect(draft).toContain('<audio draft="true"/>');
    expect(draft).toContain("こんにちは</text>");
    ready.resolve();
    await writing;
    const final = await Bun.file(path).text();
    expect(final).toContain('<dur len="60">');
    expect(final).toContain('<audio src="speech.wav"/>');
    expect(final).toContain("こんにちは</text>");
    expect(final.match(/<audio/g)).toHaveLength(1);
    expect(final).toContain('<stack id="line">');
    expect(calls).toEqual([true, false]);
  } finally {
    ready.resolve();
    await writing;
    await rm(dir, { recursive: true, force: true });
  }
});
