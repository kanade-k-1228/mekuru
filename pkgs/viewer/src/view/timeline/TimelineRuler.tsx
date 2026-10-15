import { memo } from "react";
import { formatClock } from "../../logic/formatTime";
import { LEFT_PAD, RULER_H, rulerTicks, xAt, type Viewport } from "../../logic/timeline/model";

interface Props {
  metrics: Viewport;
  uid: string;
}

export const TimelineRuler = memo(({ metrics, uid }: Props) => {
  const { width } = metrics;
  const { ticks, fine } = rulerTicks(metrics);

  return (
    <>
      <defs>
        <clipPath id={`ruler-clip-${uid}`}>
          <rect x={LEFT_PAD} y={0} width={Math.max(0, width - LEFT_PAD)} height={RULER_H} />
        </clipPath>
      </defs>

      <rect className="fill-panel" x={0} y={0} width={width} height={RULER_H} />
      <g clipPath={`url(#ruler-clip-${uid})`}>
        {ticks.map(({ sec, major }) => {
          const x = xAt(metrics, sec);
          return (
            <g key={sec.toFixed(3)}>
              <line className={major ? "stroke-dim" : "stroke-faint"} x1={x} x2={x} y1={major ? 8 : 15} y2={RULER_H} />
              {major && (
                <text className="fill-dim font-mono text-[10px]" x={x + 3} y={11}>
                  {formatClock(sec, fine)}
                </text>
              )}
            </g>
          );
        })}
      </g>
      <line className="stroke-line-strong" x1={0} x2={width} y1={RULER_H + 0.5} y2={RULER_H + 0.5} />
    </>
  );
});
