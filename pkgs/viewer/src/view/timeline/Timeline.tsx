import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useId, type PointerEvent } from "react";
import { timeAtom } from "../../logic/playback/atoms";
import { attachTimelineAtom, seekTimelineAtom } from "../../logic/timeline/actions";
import { hasEstimatedAtom, timelineLayoutAtom, timelineMetricsAtom, timelineWidthAtom } from "../../logic/timeline/atoms";
import { LEFT_PAD, RULER_H, xAt } from "../../logic/timeline/model";
import { formatTime } from "../../logic/formatTime";
import { TimelineContent } from "./TimelineContent";
import { TimelineRuler } from "./TimelineRuler";
import { TimelineScrollbar } from "./TimelineScrollbar";
import { clsx } from "clsx";

const CONTAINER = "always-scrollbar relative flex h-full flex-col overflow-x-hidden overflow-y-scroll border-t border-line bg-source select-none";
const BADGE = "rounded-full border px-[7px] text-[11px]/4";

const xIn = (e: PointerEvent<HTMLElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;

export const Timeline = () => {
  const attach = useSetAtom(attachTimelineAtom);
  const width = useAtomValue(timelineWidthAtom);
  const metrics = useAtomValue(timelineMetricsAtom);
  const layout = useAtomValue(timelineLayoutAtom);
  const estimated = useAtomValue(hasEstimatedAtom);
  const [time, seek] = useAtom(timeAtom);
  const seekAt = useSetAtom(seekTimelineAtom);
  const uid = useId().replace(/:/g, "");
  const px = xAt(metrics, time);

  const showHead = px >= LEFT_PAD - 1 && px <= width;

  return (
    <div className={CONTAINER} ref={attach}>
      <div className="sticky top-0 z-2 h-0 shrink-0">
        <div className="absolute top-0.5 right-2.5 flex gap-1.5">
          {estimated && (
            <span
              className={clsx(BADGE, "border-warning/45 bg-[#2a2416] text-warning")}
              title="Lines that are still being synthesized are shown with a length estimated from their text"
            >
              Includes estimates
            </span>
          )}
        </div>
      </div>
      <div
        className="shrink-0 cursor-crosshair touch-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekAt(xIn(e));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(xIn(e));
        }}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={metrics.duration}
        aria-valuenow={time}
        aria-valuetext={formatTime(time)}
      >
        <svg className="sticky top-0 z-1 block bg-source" width={width} height={RULER_H + 1}>
          <TimelineRuler metrics={metrics} uid={uid} />
          {showHead && (
            <g pointerEvents="none">
              <line className="stroke-playhead stroke-[1.5]" x1={px} x2={px} y1={0} y2={RULER_H + 1} />
              <path className="fill-playhead" d={`M${px - 5},0 L${px + 5},0 L${px},7 Z`} />
            </g>
          )}
        </svg>
        <svg className="block" width={width} height={layout.height}>
          <TimelineContent layout={layout} metrics={metrics} uid={uid} onSelect={seek} />
          {showHead && <line className="pointer-events-none stroke-playhead stroke-[1.5]" x1={px} x2={px} y1={0} y2={layout.height} />}
        </svg>
      </div>
      <TimelineScrollbar />
    </div>
  );
};
