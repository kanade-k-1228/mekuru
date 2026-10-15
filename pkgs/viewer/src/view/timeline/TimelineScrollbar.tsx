import { useAtom, useAtomValue } from "jotai";
import { useLayoutEffect, useRef } from "react";
import { timelineMetricsAtom, timelineViewAtom } from "../../logic/timeline/atoms";
import { SCROLLBAR_SIZE } from "../../logic/timeline/model";

export const TimelineScrollbar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const m = useAtomValue(timelineMetricsAtom);
  const [{ zoom }, setView] = useAtom(timelineViewAtom);
  const maxStart = Math.max(0, m.duration - m.visibleSec);
  const scrollFor = (el: HTMLDivElement) => (maxStart > 0 ? (m.start / maxStart) * (el.scrollWidth - el.clientWidth) : 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = scrollFor(el);
    if (Math.abs(el.scrollLeft - target) >= 1) el.scrollLeft = target;
  });

  const onScroll = () => {
    const el = ref.current;
    const maxScroll = el ? el.scrollWidth - el.clientWidth : 0;
    if (!el || maxScroll <= 0 || Math.abs(el.scrollLeft - scrollFor(el)) < 1) return;
    setView((v) => ({ ...v, start: (el.scrollLeft / maxScroll) * maxStart }));
  };

  return (
    <div
      ref={ref}
      className="always-scrollbar sticky bottom-0 z-1 mt-auto shrink-0 overflow-x-scroll overflow-y-hidden bg-hover"
      style={{ height: SCROLLBAR_SIZE }}
      onScroll={onScroll}
    >
      <div className="h-px" style={{ width: `${zoom * 100}%` }} />
    </div>
  );
};
