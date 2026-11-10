interface Wav {
  fmt: Buffer;
  data: Buffer;
}

const parseWav = (bytes: Buffer, what: string): Wav => {
  if (bytes.length < 12 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WAVE") {
    throw new Error(`${what} is not a WAV file`);
  }
  let fmt: Buffer | undefined;
  let data: Buffer | undefined;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = bytes.toString("latin1", at, at + 4);
    const size = Math.min(bytes.readUInt32LE(at + 4), bytes.length - at - 8);
    if (id === "fmt ") fmt = bytes.subarray(at + 8, at + 8 + size);
    if (id === "data") data = bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  if (!fmt || fmt.length < 16 || !data) throw new Error(`${what} is not a WAV file (no samples)`);
  return { fmt, data };
};

export const wavSeconds = (bytes: Buffer, what = "the audio"): number => {
  const { fmt, data } = parseWav(bytes, what);
  const bytesPerSecond = fmt.readUInt32LE(8);
  if (bytesPerSecond === 0) throw new Error(`${what} is not a WAV file (no sample rate)`);
  return data.length / bytesPerSecond;
};

export const joinWavs = (parts: Buffer[]): Buffer => {
  const wavs = parts.map((p, i) => parseWav(p, `part ${i + 1}`));
  const { fmt } = wavs[0];
  if (wavs.some((w) => !w.fmt.equals(fmt))) throw new Error("the parts of the line have different audio formats");
  const data = Buffer.concat(wavs.map((w) => w.data));
  const head = Buffer.alloc(12 + 8 + fmt.length + (fmt.length % 2) + 8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(head.length - 8 + data.length, 4);
  head.write("WAVEfmt ", 8, "latin1");
  head.writeUInt32LE(fmt.length, 16);
  fmt.copy(head, 20);
  head.write("data", head.length - 8, "latin1");
  head.writeUInt32LE(data.length, head.length - 4);
  return Buffer.concat([head, data]);
};

export const samples = (wav: Buffer): { rate: number; data: Float32Array } => {
  const { fmt, data } = parseWav(wav, "the audio");
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
