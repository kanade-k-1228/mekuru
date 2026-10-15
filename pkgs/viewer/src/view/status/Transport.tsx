import { useAtomValue, useSetAtom } from "jotai";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play, type LucideIcon } from "lucide-react";
import { playingAtom, stepAtom, togglePlayAtom } from "../../logic/playback/atoms";
import { scheduleAtom } from "../../logic/server";
import { Tooltip } from "../components/Tooltip";
import { clsx } from "clsx";

const ICON_BUTTON =
  "grid place-items-center rounded-md transition-colors enabled:hover:bg-hover disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  keys: { shown: string; aria: string };
  disabled: boolean;
  onClick(): void;
  main?: boolean;
}

const IconButton = ({ icon: Icon, label, keys, disabled, onClick, main }: IconButtonProps) => {
  return (
    <Tooltip label={label} keys={keys.shown}>
      <button
        type="button"
        className={clsx(ICON_BUTTON, main ? "size-8 border border-playhead/55 text-playhead" : "size-7 text-dim enabled:hover:text-fg")}
        aria-label={label}
        aria-keyshortcuts={keys.aria}
        disabled={disabled}
        onClick={onClick}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Icon size={main ? 16 : 18} fill={main ? "currentColor" : "none"} aria-hidden />
      </button>
    </Tooltip>
  );
};

export const Transport = () => {
  const playing = useAtomValue(playingAtom);
  const disabled = useAtomValue(scheduleAtom) == null;
  const onTogglePlay = useSetAtom(togglePlayAtom);
  const onStep = useSetAtom(stepAtom);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Playback">
      <IconButton
        icon={ChevronsLeft}
        label="Back 1 second"
        keys={{ shown: "Shift+←", aria: "Shift+ArrowLeft" }}
        disabled={disabled}
        onClick={() => onStep({ seconds: -1 })}
      />
      <IconButton icon={ChevronLeft} label="Back 1 frame" keys={{ shown: "←", aria: "ArrowLeft" }} disabled={disabled} onClick={() => onStep({ frames: -1 })} />
      <IconButton
        icon={playing ? Pause : Play}
        label={playing ? "Pause" : "Play"}
        keys={{ shown: "Space", aria: "Space" }}
        disabled={disabled}
        onClick={() => onTogglePlay()}
        main
      />
      <IconButton
        icon={ChevronRight}
        label="Forward 1 frame"
        keys={{ shown: "→", aria: "ArrowRight" }}
        disabled={disabled}
        onClick={() => onStep({ frames: 1 })}
      />
      <IconButton
        icon={ChevronsRight}
        label="Forward 1 second"
        keys={{ shown: "Shift+→", aria: "Shift+ArrowRight" }}
        disabled={disabled}
        onClick={() => onStep({ seconds: 1 })}
      />
    </div>
  );
};
