import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { KeyboardEvent, PointerEvent } from "react";
import { endResizeAtom, resizeToAtom, resizingAtom, startResizeAtom, timelineHeightAtom } from "../../logic/timeline/atoms";
import { clsx } from "clsx";

export const ResizeHandle = () => {
  const [height, onChange] = useAtom(timelineHeightAtom);
  const dragging = useAtomValue(resizingAtom);
  const start = useSetAtom(startResizeAtom);
  const resizeTo = useSetAtom(resizeToAtom);
  const end = useSetAtom(endResizeAtom);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start(e.clientY, e.currentTarget.parentElement?.getBoundingClientRect().height ?? height);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    onChange(height + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 100 : 20));
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Timeline height"
      aria-valuenow={Math.round(height)}
      tabIndex={0}
      title="Drag to resize (or press ↑/↓)"
      className={clsx(
        "absolute inset-x-0 -top-[3px] z-10 h-[7px] cursor-row-resize touch-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/45 focus-visible:outline-none",
        dragging && "bg-accent/70",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => resizeTo(e.clientY)}
      onPointerUp={() => end()}
      onPointerCancel={() => end()}
      onKeyDown={onKeyDown}
    />
  );
};
