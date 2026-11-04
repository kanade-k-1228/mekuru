/** A mono 16-bit WAV of these samples, or of that many silent ones. */
export const wav = (samples: number | readonly number[], rate = 48000): Buffer => {
  const values = typeof samples === "number" ? new Array<number>(samples).fill(0) : samples;
  const b = Buffer.alloc(44 + values.length * 2);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8, "latin1");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "latin1");
  b.writeUInt32LE(values.length * 2, 40);
  for (const [i, v] of values.entries()) b.writeInt16LE(v, 44 + i * 2);
  return b;
};
