import { useAtomValue, useSetAtom } from "jotai";
import { ZoomIn } from "lucide-react";
import { scheduleAtom } from "../../logic/server";
import { zoomTimelineAtom } from "../../logic/timeline/actions";
import { timelineViewAtom } from "../../logic/timeline/atoms";
import { ZOOM_MAX } from "../../logic/timeline/model";
import { Tooltip } from "../components/Tooltip";

const MAX = Math.log(ZOOM_MAX);

export const ZoomSlider = () => {
  const { zoom } = useAtomValue(timelineViewAtom);
  const setZoom = useSetAtom(zoomTimelineAtom);
  const disabled = useAtomValue(scheduleAtom) == null;
  const label = `×${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}`;

  return (
    <label className="flex flex-none items-center gap-2">
      <ZoomIn size={15} className="hidden text-dim sm:block" aria-hidden />
      <Tooltip label="Zoom the timeline" keys="Ctrl+Wheel" align="end">
        <input
          type="range"
          className="w-16 cursor-pointer accent-accent disabled:cursor-not-allowed min-[360px]:w-24 sm:w-32"
          min={0}
          max={MAX}
          step={MAX / 400}
          value={Math.log(zoom)}
          disabled={disabled}
          onChange={(e) => setZoom(Math.exp(Number(e.currentTarget.value)))}
          onPointerUp={(e) => e.currentTarget.blur()}
          aria-label="Timeline zoom"
          aria-valuetext={label}
        />
      </Tooltip>
      <span className="w-9 font-mono text-fg">{label}</span>
    </label>
  );
};
