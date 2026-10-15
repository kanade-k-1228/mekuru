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

const HALF = 0.04;
const CLOSED = 0.08;
const AGAIN = 0.12;

export interface Blinking {
  open: string;
  frames: readonly string[];
  every: number;
  fps: number;
  rand: () => number;
}

export const blinks = ({ open, frames, every, fps, rand }: Blinking, len?: number, count = 6): Shot[] => {
  const shots: Shot[] = [];
  let t = 0;
  let left = count;
  const end = len ?? Infinity;
  const show = (src: string, d: number) => {
    const n = Math.min(Math.round(d), end - t);
    if (n > 0) shots.push({ src, len: n });
    t += Math.max(0, n);
  };
  const quick = (seconds: number) => Math.max(1, Math.round(seconds * fps));
  const blink = () => {
    for (let i = frames.length - 1; i >= 1; i--) show(frames[i], quick(HALF));
    show(frames[0], quick(CLOSED));
    for (let i = 1; i < frames.length; i++) show(frames[i], quick(HALF));
  };
  const gap = () => every * (0.5 + rand());
  show(open, len === undefined ? gap() : gap() * rand());
  while (t < end && (len !== undefined || left-- > 0)) {
    blink();
    if (rand() < 0.15) {
      show(open, quick(AGAIN));
      blink();
    }
    show(open, gap());
  }
  return joined(shots);
};

export const samples = (wav: Buffer): { rate: number; data: Float32Array } => {
  if (wav.length < 12 || wav.toString("latin1", 0, 4) !== "RIFF" || wav.toString("latin1", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let fmt: Buffer | undefined;
  let data: Buffer | undefined;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString("latin1", at, at + 4);
    const size = Math.min(wav.readUInt32LE(at + 4), wav.length - at - 8);
    if (id === "fmt ") fmt = wav.subarray(at + 8, at + 8 + size);
    if (id === "data") data = wav.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  if (!fmt || fmt.length < 16 || !data) throw new Error("not a WAV file (no samples)");
  const body = data;
  let format = fmt.readUInt16LE(0);
  if (format === 0xfffe && fmt.length >= 26) format = fmt.readUInt16LE(24);
  const channels = Math.max(1, fmt.readUInt16LE(2));
  const rate = fmt.readUInt32LE(4);
  const bits = fmt.readUInt16LE(14);
  const bytes = bits / 8;
  const read: ((at: number) => number) | undefined =
    format === 3 && bits === 32
      ? (at) => body.readFloatLE(at)
      : format === 3 && bits === 64
        ? (at) => body.readDoubleLE(at)
        : format !== 1
          ? undefined
          : bits === 8
            ? (at) => (body.readUInt8(at) - 128) / 128
            : bits === 16
              ? (at) => body.readInt16LE(at) / 32768
              : bits === 24
                ? (at) => body.readIntLE(at, 3) / 8388608
                : bits === 32
                  ? (at) => body.readInt32LE(at) / 2147483648
                  : undefined;
  if (!read || rate === 0) throw new Error(`the WAV format is not supported (format ${format}, ${bits} bit)`);
  const n = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read((i * channels + c) * bytes);
    out[i] = sum / channels;
  }
  return { rate, data: out };
};

const SHAPES_PER_SECOND = 15;
const QUIET = 0.12;

export const lipSync = (wav: Buffer, shapes: readonly string[], len: number, fps: number): Shot[] => {
  const { rate, data } = samples(wav);
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
