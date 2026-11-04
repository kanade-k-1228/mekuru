import type { FC } from "@mekuru/types";
import { Audio } from "@mekuru/audio";
import { Voicevox, zunda } from "@mekuru/voicevox";
import { portrait, type PortraitOptions } from "@mekuru/narrator";
import { READING, Subtitle, type Line } from "../parts";
import type { LayerProps } from "../../assets/character/zundamon/portrait";

export const Zundamon: FC<Line> = async ({ children, ...time }) => {
  const line = await Voicevox.prepare({ ...zunda, gap: 6, reading: READING, children });
  return (
    <dur len={line.audio.len} {...time}>
      <stack>
        <Audio source={line.audio} />
        <Subtitle stroke="#355137">{line.display}</Subtitle>
      </stack>
    </dur>
  );
};

type PortraitProps = LayerProps & Omit<PortraitOptions, "src" | "slot">;
export const ZundamonPortrait: FC<PortraitProps> = ({ face, ...placement }) => {
  const actor = portrait<LayerProps>({ src: "assets/character/zundamon", x: "85%", ...placement });
  return <actor.Stand face={face} />;
};
