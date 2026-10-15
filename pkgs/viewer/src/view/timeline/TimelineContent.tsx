import { memo, type PointerEvent as ReactPointerEvent } from "react";
import type { ClipLane } from "@mekuru/cli/protocol";
import { formatTime } from "../../logic/formatTime";
import { clsx } from "clsx";
import { LEFT_PAD, rulerTicks, xAt, type Layout, type Viewport } from "../../logic/timeline/model";

const DEPTH_FILL = ["fill-depth-0", "fill-depth-1", "fill-depth-2", "fill-depth-3", "fill-depth-4", "fill-depth-5"];
const LANE_CLASS: Record<ClipLane, string> = {
  speech: "fill-accent/42 stroke-[#6f9cf5]",
  visual: "fill-[#c38bff]/30 stroke-[#b285f0]",
  video: "fill-[#3ec98a]/30 stroke-[#3ec98a]",
  audio: "fill-warning/28 stroke-[#e0a845]",
};
const HIT = "group cursor-pointer";
const HOVER = "group-hover:brightness-125";
const tagged = (tag: string, label: string) => (label ? `<${tag}> ${label}` : `<${tag}>`);
const Tag = ({ name }: { name: string }) => <tspan className="fill-white/55">{`<${name}>`}</tspan>;

interface Props {
  layout: Layout;
  metrics: Viewport;
  uid: string;
  onSelect(start: number): void;
}

export const TimelineContent = memo(({ layout, metrics, uid, onSelect }: Props) => {
  const { width } = metrics;
  const xOf = (sec: number) => xAt(metrics, sec);
  const inView = (a: number, b: number) => xOf(b) >= LEFT_PAD && xOf(a) <= width;
  const { ticks } = rulerTicks(metrics);
  const select = (e: ReactPointerEvent, startSec: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(startSec);
  };

  return (
    <>
      <defs>
        <pattern id={`hatch-${uid}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="3" height="6" className="fill-[rgb(255_220_120/0.4)]" />
        </pattern>
        <clipPath id={`clip-${uid}`}>
          <rect x={LEFT_PAD} y={0} width={Math.max(0, width - LEFT_PAD)} height={layout.height} />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${uid})`}>
        {ticks.map(({ sec, major }) => {
          if (!major) return null;
          const x = xOf(sec);
          return <line key={sec.toFixed(3)} className="stroke-white/[0.045]" x1={x} x2={x} y1={0} y2={layout.height} />;
        })}

        {layout.nodes.map(({ node, y, h, depth }) => {
          if (!inView(node.start, node.end)) return null;
          const x1 = xOf(node.start);
          const x2 = Math.max(xOf(node.end), x1 + 1);
          const labelX = Math.max(x1, LEFT_PAD) + 4;
          const clipId = `${uid}-node-${node.id}`;
          return (
            <g key={`n${node.id}`} className={HIT} onPointerDown={(e) => select(e, node.start)}>
              <rect className={clsx("stroke-black/35", DEPTH_FILL[depth % DEPTH_FILL.length], HOVER)} x={x1} y={y} width={x2 - x1} height={h} rx={3} />
              <clipPath id={clipId}>
                <rect x={labelX} y={y} width={Math.max(0, x2 - labelX - 4)} height={h} />
              </clipPath>
              <text clipPath={`url(#${clipId})`} className="pointer-events-none fill-[#eef2f8] text-[11px]" x={labelX} y={y + h / 2 + 4}>
                <Tag name={node.tag} />
                {node.label && ` ${node.label}`}
              </text>
              <title>{`${tagged(node.tag, node.label)}  ${formatTime(node.start)} – ${formatTime(node.end)}${
                node.pin != null ? `  (@${node.pin})` : ""
              }  L${node.line}`}</title>
            </g>
          );
        })}

        {layout.clips.map(({ clip, y, h }, i) => {
          if (!inView(clip.start, clip.end)) return null;
          const x1 = xOf(clip.start);
          const x2 = Math.max(xOf(clip.end), x1 + 1);
          const text = tagged(clip.tag, clip.label);
          const firstFreeze = clip.freezes.find(([a, b]) => b > clip.start && a < clip.end);
          const labelEnd = firstFreeze && xOf(firstFreeze[0]) > x1 + 20 ? xOf(firstFreeze[0]) : x2;
          const labelX = Math.max(x1, LEFT_PAD) + 4;
          const clipId = `${uid}-clip-${i}`;
          return (
            <g key={`c${i}`} className={HIT} onPointerDown={(e) => select(e, clip.start)}>
              <rect
                className={clsx("stroke-1", LANE_CLASS[clip.lane], HOVER, clip.estimated && "opacity-55 [stroke-dasharray:4_3]")}
                x={x1 + 0.5}
                y={y + 0.5}
                width={Math.max(x2 - x1 - 1, 1)}
                height={h - 1}
                rx={2}
              />
              {clip.freezes.map(([a, b], i) => {
                const fa = Math.max(a, clip.start);
                const fb = Math.min(b, clip.end);
                if (fb <= fa) return null;
                const fx = xOf(fa);
                const fw = Math.max(xOf(fb) - fx, 1);
                return (
                  <g key={i}>
                    <rect className="stroke-[rgb(255_220_120/0.55)] stroke-1" x={fx} y={y} width={fw} height={h} fill={`url(#hatch-${uid})`} />
                    {fw > 46 && (
                      <text
                        className="pointer-events-none fill-[#ffe7a6] stroke-black/65 stroke-3 text-[10px] font-bold [paint-order:stroke]"
                        x={fx + fw / 2}
                        y={y + h / 2 + 4}
                        textAnchor="middle"
                      >
                        Frozen
                      </text>
                    )}
                    <title>{`Frozen ${formatTime(fa)} – ${formatTime(fb)}`}</title>
                  </g>
                );
              })}
              <clipPath id={clipId}>
                <rect x={labelX} y={y} width={Math.max(0, labelEnd - labelX - 4)} height={h} />
              </clipPath>
              <text
                clipPath={`url(#${clipId})`}
                className={clsx("pointer-events-none fill-[#e9eef7] text-[10.5px]", clip.estimated && "opacity-70")}
                x={labelX}
                y={y + h / 2 + 4}
              >
                <Tag name={clip.tag} />
                {clip.label && ` ${clip.label}`}
              </text>
              <title>{`${text}  ${formatTime(clip.start)} – ${formatTime(clip.end)}${clip.estimated ? " (estimated)" : ""}  L${clip.line}`}</title>
            </g>
          );
        })}
      </g>
    </>
  );
});
