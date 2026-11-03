import { type FC, writeXml } from "@mekuru/types";
import { Zundamon, ZundamonPortrait } from "./character/zundamon";

const Video: FC = () => (
  <mekuru size="1920x1080" fps={30}>
    <rect w="100%" h="100%" fill="#141C26" />
    <ZundamonPortrait x="85%" h="45%" />
    <stack>
      <text x="50%" y="35%" anchor="center" size={90}>
        はじめての動画
      </text>
      <seq>
        <Zundamon>こんにちは、ずんだもんなのだ。</Zundamon>
        <Zundamon>今日は Mekuru で動画を作るのだ。</Zundamon>
      </seq>
    </stack>
    <stack>
      <column x="50%" y="25%" anchor="t" gap={24} align="center">
        <text size={72} color="#7FD1AE">
          動画を作る流れ
        </text>
        <text size={48}>台本を書く → 保存して確認 → 書き出す</text>
      </column>
      <seq>
        <Zundamon>台本を保存して、プレビューで確かめます。</Zundamon>
        <Zundamon>できあがったら、動画ファイルに書き出しましょう。</Zundamon>
      </seq>
    </stack>
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
