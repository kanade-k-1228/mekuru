import { Voisona } from "@mekuru/voisona";
import { Portrait, READING, Subtitle, type Line, type PortraitProps } from "../parts";

export const Tsuzumi = ({ children, ...time }: Line) => (
  <stack {...time}>
    <Voisona name="tsuzumi" voice="suzuki-tsudumi_ja_JP" gap={6} reading={READING}>
      {children}
    </Voisona>
    <Subtitle stroke="#2E5E8C">{children}</Subtitle>
  </stack>
);

export const TsuzumiPortrait = (props: PortraitProps) => <Portrait src="assets/character/tsuzumi.png" x="85%" {...props} />;
