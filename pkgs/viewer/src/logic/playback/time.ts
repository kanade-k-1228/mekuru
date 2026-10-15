import type { Fade, MediaMap, SceneElement } from "@mekuru/cli/protocol";

interface Interval {
  start: number;
  end: number;
}
interface Branch<T> {
  item: T;
  min: number;
  max: number;
  left: Branch<T> | null;
  right: Branch<T> | null;
}
export const intervalIndex = <T extends Interval>(items: readonly T[]) => {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const build = (lo: number, hi: number): Branch<T> | null => {
    if (lo === hi) return null;
    const mid = (lo + hi) >>> 1;
    const item = sorted[mid];
    const left = build(lo, mid);
    const right = build(mid + 1, hi);
    return { item, left, right, min: sorted[lo].start, max: Math.max(item.end, left?.max ?? -Infinity, right?.max ?? -Infinity) };
  };
  const root = build(0, sorted.length);
  return (time: number): T[] => {
    const out: T[] = [];
    const visit = (node: Branch<T> | null) => {
      if (!node || time < node.min || time >= node.max) return;
      visit(node.left);
      if (node.item.start <= time && time < node.item.end) out.push(node.item);
      visit(node.right);
    };
    visit(root);
    return out;
  };
};

export const frames = (element: Pick<SceneElement, "repeat">, t: number): number[] | null => {
  const out = [t];
  for (const [from, period, until] of element.repeat) {
    const u = out[out.length - 1];
    if (u < from || u >= until) return null;
    out.push(from + ((u - from) % period));
  }
  return out;
};

const localTime = (element: Pick<SceneElement, "repeat">, t: number): number | null => frames(element, t)?.at(-1) ?? null;

export const shownAt = (element: Pick<SceneElement, "start" | "end" | "repeat" | "hidden">, t: number): boolean => {
  const u = localTime(element, t);
  return u !== null && element.start <= u && u < element.end && !element.hidden.some(([a, b]) => a <= t && t < b);
};

export const span = (element: Pick<SceneElement, "start" | "end" | "repeat">): { start: number; end: number } => ({
  start: element.start,
  end: element.repeat.length ? Math.max(element.end, element.repeat[0][2]) : element.end,
});

export const envelope = (fades: readonly Fade[], times: readonly number[]): number =>
  fades.reduce((value, [start, end, fi, fo, level]) => {
    const t = times[level] ?? times[times.length - 1];
    const fade = Math.min(1, fi > 0 ? (t - start) / fi : 1, fo > 0 ? (end - t) / fo : 1);
    return value * Math.max(0, fade);
  }, 1);

export const mediaAt = (map: MediaMap, t: number): { position: number; rate: number } => {
  let lo = 0;
  let hi = map.segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (map.segments[mid][0] <= t + 1e-6) lo = mid + 1;
    else hi = mid;
  }
  const seg = map.segments[Math.max(0, lo - 1)];
  const position = seg ? seg[2] + seg[3] * Math.max(0, t - seg[0]) : map.from;
  const rate = seg && t < seg[1] ? seg[3] : 0;
  return { position: Math.min(position, map.end), rate };
};
