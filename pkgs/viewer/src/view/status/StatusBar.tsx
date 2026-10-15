import { useAtomValue } from "jotai";
import { timeAtom } from "../../logic/playback/atoms";
import { connAtom, scheduleAtom, type ConnState } from "../../logic/server";
import { formatTime } from "../../logic/formatTime";
import { Transport } from "./Transport";
import { clsx } from "clsx";
import { ZoomSlider } from "./ZoomSlider";

const CONN_LABEL: Record<ConnState, string> = {
  connecting: "Connecting…",
  open: "Connected",
  reconnecting: "Reconnecting…",
};

const DOT: Record<ConnState, string> = {
  connecting: "bg-faint",
  open: "bg-ok",
  reconnecting: "bg-warning animate-[pulse_1s_ease-in-out_infinite]",
};

const Clock = ({ duration }: { duration: number }) => {
  const time = useAtomValue(timeAtom);
  return (
    <span className="font-mono text-[12.5px] text-fg">
      {formatTime(time)} / {formatTime(duration)}
    </span>
  );
};

export const StatusBar = () => {
  const conn = useAtomValue(connAtom);
  const schedule = useAtomValue(scheduleAtom);
  return (
    <footer className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-0.5 border-t border-line bg-panel px-3 py-1 text-[11.5px] whitespace-nowrap text-dim tabular-nums sm:h-10 sm:grid-cols-[1fr_auto_1fr] sm:py-0">
      <div className="row-start-2 flex min-w-0 items-center gap-3.5 sm:row-start-1">
        <span className={clsx("inline-flex items-center gap-1.5", conn === "reconnecting" && "text-warning")} title={CONN_LABEL[conn]}>
          <span className={clsx("size-[7px] rounded-full", DOT[conn])} aria-hidden />
          <span className="sr-only">{CONN_LABEL[conn]}</span>
        </span>
        {schedule && (
          <>
            <Clock duration={schedule.duration} />
            <span className="hidden lg:inline">
              {schedule.width}×{schedule.height} · {schedule.fps}fps
            </span>
          </>
        )}
      </div>
      <div className="col-span-2 row-start-1 justify-self-center sm:col-span-1">
        <Transport />
      </div>
      <div className="row-start-2 flex min-w-0 justify-end sm:row-start-1">
        <ZoomSlider />
      </div>
    </footer>
  );
};
