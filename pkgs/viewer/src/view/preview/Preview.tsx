import { useAtomValue, useSetAtom } from "jotai";
import type { PreviewDto } from "@mekuru/cli/protocol";
import { attachStageBoxAtom, stageScaleAtom } from "../../logic/stage";
import { Stage } from "./Stage";

export const Preview = ({ schedule }: { schedule: PreviewDto }) => {
  const attach = useSetAtom(attachStageBoxAtom);
  const scale = useAtomValue(stageScaleAtom);
  const { width, height } = schedule;

  return (
    <section ref={attach} className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-black" aria-label="Preview">
      <div style={{ width: width * scale, height: height * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <Stage width={width} height={height} />
        </div>
      </div>
    </section>
  );
};
