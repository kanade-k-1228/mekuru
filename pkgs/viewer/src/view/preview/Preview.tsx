import { useCallback, useState } from "react";
import type { PreviewDto } from "../../protocol";
import { observeSize } from "../../logic/util";
import { Stage } from "./Stage";

export const Preview = ({ schedule }: { schedule: PreviewDto }) => {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const attach = useCallback((el: HTMLElement | null) => (el ? observeSize(el, setBox) : undefined), []);
  const { width, height } = schedule;
  const scale = box ? Math.min(box.width / width, box.height / height) : 0.25;

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
