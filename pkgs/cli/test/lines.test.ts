import { expect, test } from "bun:test";
import { lineReader } from "../src/lines.ts";

test("JSON lines survive byte boundaries, large records and multiple records in one chunk", async () => {
  const first = JSON.stringify({ xml: "字幕🙂".repeat(50_000) });
  const second = JSON.stringify({ xml: "next" });
  const bytes = new TextEncoder().encode(`${first}\n${second}\n`);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 997) controller.enqueue(bytes.slice(offset, offset + 997));
      controller.close();
    },
  });
  const read = lineReader(stream);
  expect(await read()).toBe(first);
  expect(await read()).toBe(second);
  expect(await read()).toBeNull();
});
