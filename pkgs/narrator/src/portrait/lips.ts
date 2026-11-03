import { joined, type Shot } from "./shots.ts";
const SHAPES_PER_SECOND = 15;
const QUIET = 0.12;

export const lipSync = (audio: { rate: number; data: Float32Array }, shapes: readonly string[], len: number, fps: number): Shot[] => {
  const { rate, data } = audio;
  const step = rate / SHAPES_PER_SECOND;
  const count = Math.ceil(data.length / step);
  const loudness: number[] = [];
  for (let k = 0; k < count; k++) {
    const [a, b] = [Math.floor(k * step), Math.min(data.length, Math.floor((k + 1) * step))];
    let sum = 0;
    for (let i = a; i < b; i++) sum += data[i] * data[i];
    loudness.push(Math.sqrt(sum / Math.max(1, b - a)));
  }
  const full = Math.max(...loudness, 0) * 0.6;
  const open = shapes.length - 1;
  const shots: Shot[] = [];
  let t = 0;
  for (let k = 0; k < count && t < len; k++) {
    const v = full > 1e-4 ? Math.min(1, loudness[k] / full) : 0;
    const shape = v < QUIET ? 0 : Math.min(open, 1 + Math.floor(((v - QUIET) / (1 - QUIET)) * open));
    const end = Math.min(len, Math.round(((k + 1) * fps) / SHAPES_PER_SECOND));
    shots.push({ src: shapes[shape], len: end - t });
    t = end;
  }
  shots.push({ src: shapes[0], len: len - t });
  return joined(shots);
};
