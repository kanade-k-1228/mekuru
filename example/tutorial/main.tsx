import { writeXml } from "@mekuru/core";
import { Tsuzumi, TsuzumiPortrait } from "./character/tsuzumi";

const Video = () => (
  <mekuru size="1920x1080" fps={30}>
    <rect w="100%" h="100%" fill="#141C26" />
    <TsuzumiPortrait x="85%" h="45%" />
    <stack>
      <text x="50%" y="35%" anchor="center" size={90}>
        はじめての動画
      </text>
      <seq>
        <Tsuzumi>こんにちは、すずきつづみです。</Tsuzumi>
        <Tsuzumi>今日は Mekuru で動画を作ります。</Tsuzumi>
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
        <Tsuzumi>台本を保存して、プレビューで確かめます。</Tsuzumi>
        <Tsuzumi>できあがったら、動画ファイルに書き出しましょう。</Tsuzumi>
      </seq>
    </stack>
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
