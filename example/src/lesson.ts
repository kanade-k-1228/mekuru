const FIRST_SCENE = `<stack>
  <text x="50%" y="35%" anchor="center" size={90}
    text="はじめての動画" />
  <seq>
    <Zundamon text="こんにちは、ずんだもんなのだ。" />
    <Zundamon text="今日は Mekuru で動画を作るのだ。" />
  </seq>
</stack>`;

export const SECOND_SCENE = `<stack>
  <column x="50%" y="25%" anchor="t" gap={24} align="center">
    <text size={72} color="#7FD1AE" text="動画を作る流れ" />
    <text size={48} text="台本を書く → 保存して確認 → 書き出す" />
  </column>
  <seq>
    <Zundamon text="台本を保存して、プレビューで確かめます。" />
    <Zundamon text="できあがったら、動画ファイルに書き出しましょう。" />
  </seq>
</stack>`;

const indent = (code: string, spaces: number) =>
  code
    .split("\n")
    .map((line) => " ".repeat(spaces) + line)
    .join("\n");

const script = (body: string) => `import { type FC, writeXml } from "@mekuru/types";
import { Zundamon } from "./character/zundamon";

const Video: FC = () => (
  <mekuru size="1920x1080" fps={30}>
${indent(body, 4)}
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
`;

export const FIRST_SCRIPT = script(`<rect w="100%" h="100%" fill="#141C26" />\n${FIRST_SCENE}`);
export const PORTRAITS = `<ZundamonPortrait x="85%" h="45%" />`;
