import type { ClipLane, TimelineClip, TimelineDto, TimelineNode } from "@mekuru/cli/protocol";
import { clamp } from "../math.ts";

export const LEFT_PAD = 12;
const RIGHT_PAD = 12;
export const RULER_H = 22;
export const SCROLLBAR_SIZE = 10;
const NODE_ROW_H = 18;
const CLIP_ROW_H = 15;
const ROW_GAP = 3;
const GROUP_GAP = 7;
const MAX_SUBROWS = 4;
const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const LANES: ClipLane[] = ["speech", "visual", "video", "audio"];

interface PlacedNode {
  node: TimelineNode;
  y: number;
  h: number;
  depth: number;
}
interface PlacedClip {
  clip: TimelineClip;
  y: number;
  h: number;
}
export interface Layout {
  nodes: PlacedNode[];
  clips: PlacedClip[];
  height: number;
}

const pack = (items: { start: number; end: number }[]): { rows: number[]; count: number } => {
  const ends: number[] = [];
  const rows = items.map((it) => {
    let row = ends.findIndex((end) => end <= it.start + 1e-6);
    if (row < 0 && ends.length < MAX_SUBROWS) row = ends.push(it.end) - 1;
    else if (row < 0) row = ends.indexOf(Math.min(...ends));
    ends[row] = Math.max(ends[row], it.end);
    return row;
  });
  return { rows, count: Math.max(1, ends.length) };
};

export const buildLayout = (tl: TimelineDto): Layout => {
  const nodes: PlacedNode[] = [];
  const clips: PlacedClip[] = [];
  let y = ROW_GAP + 1;

  const barNodes = tl.nodes.filter((n) => n.kind !== "seq");
  const depths = [...new Set(barNodes.map((n) => n.depth))].sort((a, b) => a - b);
  for (const [i, d] of depths.entries()) {
    const bars = barNodes.filter((n) => n.depth === d).sort((a, b) => a.start - b.start || b.end - a.end);
    const packed = pack(bars);
    for (const [k, n] of bars.entries()) {
      nodes.push({ node: n, y: y + packed.rows[k] * (NODE_ROW_H + 1), h: NODE_ROW_H, depth: i });
    }
    y += packed.count * (NODE_ROW_H + 1) - 1 + ROW_GAP;
  }

  y += GROUP_GAP;

  for (const lane of LANES) {
    const laneClips = tl.clips.filter((c) => c.lane === lane).sort((a, b) => a.start - b.start || b.end - a.end);
    if (laneClips.length === 0) continue;
    const packed = pack(laneClips);
    for (const [k, clip] of laneClips.entries()) {
      clips.push({ clip, y: y + packed.rows[k] * (CLIP_ROW_H + 1), h: CLIP_ROW_H });
    }
    y += packed.count * (CLIP_ROW_H + 1) - 1 + ROW_GAP + 1;
  }
  return { nodes, clips, height: y + 4 };
};

const pickTickStep = (pxPerSec: number): number => {
  return TICK_STEPS.find((s) => s * pxPerSec >= 72) ?? TICK_STEPS[TICK_STEPS.length - 1];
};

export interface ViewState {
  zoom: number;
  start: number;
}
export interface Viewport {
  width: number;
  duration: number;
  usable: number;
  pxPerSec: number;
  visibleSec: number;
  start: number;
}

export const viewport = (length: number, width: number, view: ViewState): Viewport => {
  const duration = Math.max(length, 0.001);
  const usable = Math.max(width - LEFT_PAD - RIGHT_PAD, 10);
  const pxPerSec = (usable / duration) * view.zoom;
  const visibleSec = usable / pxPerSec;
  const start = clamp(view.start, 0, Math.max(0, duration - visibleSec));
  return { width, duration, usable, pxPerSec, visibleSec, start };
};

export const xAt = (m: Viewport, time: number): number => LEFT_PAD + (time - m.start) * m.pxPerSec;
export const timeAt = (m: Viewport, x: number): number => clamp(m.start + (x - LEFT_PAD) / m.pxPerSec, 0, m.duration);

export const ZOOM_MAX = 400;

export const zoomAt = (m: Viewport, zoom: number, x: number): ViewState => {
  zoom = clamp(zoom, 1, ZOOM_MAX);
  const offset = Math.max(x, LEFT_PAD) - LEFT_PAD;
  const anchor = m.start + offset / m.pxPerSec;
  return { zoom, start: anchor - offset / ((m.usable / m.duration) * zoom) };
};

export const zoomAround = (view: ViewState, zoom: number, length: number, anchor: number): ViewState => {
  const duration = Math.max(length, 0.001);
  zoom = clamp(zoom, 1, ZOOM_MAX);
  const visible = duration / view.zoom;
  const start = clamp(view.start, 0, Math.max(0, duration - visible));
  const f = clamp((anchor - start) / visible, 0, 1);
  return { zoom, start: anchor - (f * duration) / zoom };
};

export const rulerTicks = ({ pxPerSec, start, visibleSec, duration }: Viewport) => {
  const step = pickTickStep(pxPerSec);
  const minor = step * pxPerSec >= 120 ? step / 5 : step / 2;
  const ticks: { sec: number; major: boolean }[] = [];
  const first = Math.floor(start / minor) * minor;
  for (let sec = first; sec <= start + visibleSec + minor; sec += minor) {
    const rounded = Math.round(sec / minor) * minor;
    if (rounded < 0 || rounded > duration + 1e-6) continue;
    const k = rounded / step;
    ticks.push({ sec: rounded, major: Math.abs(k - Math.round(k)) < 1e-6 });
  }
  return { ticks, fine: step < 1 };
};
