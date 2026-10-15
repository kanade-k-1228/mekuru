export const FIRST_SCENE = `<stack>
  <text x="50%" y="35%" anchor="center" size={90}>
    はじめての動画
  </text>
  <seq>
    <Zunda>こんにちは、ずんだもんなのだ。</Zunda>
    <Metan>今日は Mekuru で動画を作るわ。</Metan>
  </seq>
</stack>`;

export const SECOND_SCENE = `<stack>
  <column x="50%" y="25%" anchor="t" gap={24} align="center">
    <text size={72} color="#7FD1AE">動画を作る流れ</text>
    <text size={48}>台本を書く → 保存して確認 → 書き出す</text>
  </column>
  <seq>
    <Zunda>台本を保存して、プレビューで確かめるのだ。</Zunda>
    <Metan>できあがったら、動画ファイルに書き出しましょう。</Metan>
  </seq>
</stack>`;

const indent = (code: string, spaces: number) =>
  code
    .split("\n")
    .map((line) => " ".repeat(spaces) + line)
    .join("\n");

const script = (body: string) => `import { writeXml } from "@mekuru/core";
import { Zunda, ZundaPortrait } from "./character/zunda";
import { Metan, MetanPortrait } from "./character/metan";

const Video = () => (
  <mekuru size="1920x1080" fps={30}>
${indent(body, 4)}
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
`;

export const FIRST_SCRIPT = script(`<rect w="100%" h="100%" fill="#141C26" />\n${FIRST_SCENE}`);
export const PORTRAITS = `<ZundaPortrait x="90%" h="45%" />
<MetanPortrait x="10%" h="45%" />`;
export const FINAL_SCRIPT = script(`<rect w="100%" h="100%" fill="#141C26" />\n${PORTRAITS}\n${FIRST_SCENE}\n${SECOND_SCENE}`);
