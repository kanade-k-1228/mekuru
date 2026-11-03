export interface Shot {
  src: string;
  len: number;
}

export const joined = (shots: readonly Shot[]): Shot[] => {
  const out: Shot[] = [];
  for (const s of shots) {
    if (s.len <= 0) continue;
    const last = out[out.length - 1];
    if (last?.src === s.src) last.len += s.len;
    else out.push({ ...s });
  }
  return out;
};

export const random = (seed: string): (() => number) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
