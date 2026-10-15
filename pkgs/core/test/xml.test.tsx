import { expect, test } from "bun:test";
import { fps, isDraft, toXml, type Node } from "@mekuru/core";

const body = async (video: Node) => {
  const xml = await toXml(<mekuru size="320x180">{video}</mekuru>);
  return xml
    .split("\n")
    .slice(2, -3)
    .map((l) => l.trim());
};

test("nothing says whether it has a length: its kind does", async () => {
  expect(
    await body(
      <>
        <rect w="100%" h="100%" fill="white" />
        <stack>
          <text>見出し</text>
          <audio src="a.wav" />
        </stack>
        <stack x={10}>
          <text>字幕</text>
        </stack>
        <repeat fadein={30} fadeout={60}>
          <audio src="bgm.mp3" volume="50%" />
        </repeat>
      </>,
    ),
  ).toEqual([
    '<rect w="100%" h="100%" fill="#FFFFFF"/>',
    "<stack>",
    "<text>見出し</text>",
    '<audio src="a.wav"/>',
    "</stack>",
    '<stack x="10">',
    "<text>字幕</text>",
    "</stack>",
    '<repeat fadein="30" fadeout="60">',
    '<audio src="bgm.mp3" volume="0.5"/>',
    "</repeat>",
  ]);
});

test("at is a reference or a delay, and values are written one way", async () => {
  expect(
    await body(
      <>
        <rect at="intro" w={1} h="10%" anchor="center" x={0} />
        <dur at="clip:150" len={45}>
          <rect w={1} h={1} />
        </dur>
        <stack at={15} w={1} h={1} padding={[4, "10%"]} />
        <row align="center" grow wrap={false} />
      </>,
    ),
  ).toEqual([
    '<rect at="intro:0" w="1" h="10%" anchor="c" x="0"/>',
    '<dur at="clip:150" len="45">',
    '<rect w="1" h="1"/>',
    "</dur>",
    '<stack delay="15" w="1" h="1" padding="4 10%"/>',
    '<row align="center" grow="1"/>',
  ]);
});

test("a speed and a cut are in their media and take frames of its source", async () => {
  expect(
    await body(
      <video src="life.mp4">
        <speed from={60} to={180} rate={2} />
        <cut from={210} />
      </video>,
    ),
  ).toEqual(['<video src="life.mp4">', '<speed from="60" to="180" rate="2"/>', '<cut from="210"/>', "</video>"]);
});

test("a hold is in its media, and makes the media wait however long it is", async () => {
  expect(
    await body(
      <video id="life" src="life.mp4">
        <hold at={285}>
          <text>一時停止中</text>
        </hold>
      </video>,
    ),
  ).toEqual(['<video id="life" src="life.mp4">', '<hold at="285">', "<text>一時停止中</text>", "</hold>", "</video>"]);
});

test("components see the frame rate of the video", async () => {
  const Pause = () => <dur len={fps() / 2} />;
  expect(
    await toXml(
      <mekuru fps={24}>
        <Pause />
      </mekuru>,
    ),
  ).toBe('<mekuru fps="24">\n  <seq>\n    <dur len="12"/>\n  </seq>\n</mekuru>\n');
  expect(await body(<Pause />)).toEqual(['<dur len="15"/>']);
  expect(() => fps()).toThrow();
});

test("components run, async ones too, and see whether this is the draft", async () => {
  const Line = async ({ children }: { children: string }) => {
    await Promise.resolve();
    return isDraft() ? (
      <dur len={30}>
        <audio draft label={children} />
      </dur>
    ) : (
      <audio src="line.wav" label={children} />
    );
  };
  const Both = ({ children }: { children: Node }) => (
    <stack>
      {children}
      <text>
        a &amp; b<br />
        &lt;c&gt;
      </text>
    </stack>
  );
  expect(
    await body(
      <Both>
        <Line>こんにちは</Line>
      </Both>,
    ),
  ).toEqual(["<stack>", '<audio src="line.wav" label="こんにちは"/>', "<text>a &amp; b<br/>&lt;c&gt;</text>", "</stack>"]);
});

test("the video is one seq", async () => {
  const xml = await toXml(
    <mekuru fps={30}>
      <dur len={30}>
        <text>a</text>
      </dur>
    </mekuru>,
  );
  expect(xml).toBe('<mekuru fps="30">\n  <seq>\n    <dur len="30">\n      <text>a</text>\n    </dur>\n  </seq>\n</mekuru>\n');
});
