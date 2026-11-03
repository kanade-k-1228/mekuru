/** Reads large JSON Lines without repeatedly scanning or copying the accumulated line. */
export const lineReader = (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let rest = "";
  return async (): Promise<string | null> => {
    const chunks: string[] = [];
    let value = rest;
    rest = "";
    for (;;) {
      const end = value.indexOf("\n");
      if (end >= 0) {
        chunks.push(value.slice(0, end));
        rest = value.slice(end + 1);
        return chunks.join("");
      }
      if (value) chunks.push(value);
      const next = await reader.read();
      if (next.done) return null;
      value = next.value;
    }
  };
};
