import type { FC } from "@mekuru/types";
import { Audio } from "@mekuru/audio";
import { Voisona } from "@mekuru/voisona";
import { Portrait, READING, Subtitle, type Line, type PortraitProps } from "../parts";

export const Tsuzumi: FC<Line> = async ({ children, ...time }) => {
  const line = await Voisona.prepare({ name: "tsuzumi", voice: "suzuki-tsudumi_ja_JP", gap: 6, reading: READING, children });
  return (
    <dur len={line.len} {...time}>
      <stack>
        <Audio source={line.audio} />
        <Subtitle stroke="#2E5E8C">{line.display}</Subtitle>
      </stack>
    </dur>
  );
};

export const TsuzumiPortrait: FC<PortraitProps> = (props) => <Portrait src="assets/character/tsuzumi.png" x="85%" {...props} />;
