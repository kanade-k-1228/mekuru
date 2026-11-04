/** Native-server test and latency harness; all serving and compilation runs in the native binary. */
import { findCompiler } from "../npm/compiler.js";
import { previewSocketUrl } from "../../viewer/src/logic/preview.ts";
import type { PreviewCommand, PreviewEvent } from "../../viewer/src/protocol.ts";

/** A caption sequence whose middle caption changes with `edit`. */
export const previewXml = (count: number, edit: number, language: string) => {
  const caption = (i: number) => {
    const changed = i === Math.floor(count / 2);
    return language === "ja"
      ? `プレビュー計測用の字幕 ${changed ? `修正 ${edit}` : `番号 ${i}`} 日本語の折り返しを確認します`
      : `Caption ${changed ? `edited ${edit}` : `number ${i}`} for preview benchmark`;
  };
  return `<mekuru size="640x360" fps="30"><seq>${Array.from({ length: count }, (_, i) => `<dur len="30"><text x="10" y="20" size="32">${caption(i)}</text></dur>`).join("")}</seq></mekuru>`;
};

export async function startServer(opts: { xml: string; port: number; root?: string; run?: string; compiler?: string; env?: Record<string, string> }) {
  const args = [opts.compiler ?? findCompiler(), opts.xml, "--serve", "--no-open", "--port", String(opts.port)];
  for (const key of ["root", "run"] as const) if (opts[key]) args.push(`--${key}`, opts[key]);
  const process = Bun.spawn(args, { stdout: "ignore", stderr: "pipe", env: opts.env ?? globalThis.process.env });
  const close = () => process.kill("SIGTERM");
  let stderr = "";
  let announce!: (url: string) => void;
  let fail!: (error: Error) => void;
  const ready = new Promise<string>((resolve, reject) => {
    announce = resolve;
    fail = reject;
  });
  const timeout = setTimeout(() => {
    close();
    fail(new Error(`server startup timeout: ${stderr}`));
  }, 10_000);
  void (async () => {
    for await (const bytes of process.stderr) {
      stderr = (stderr + new TextDecoder().decode(bytes)).slice(-16000);
      const url = /mekuru viewer: (http:\/\/[^\s]+)/.exec(stderr)?.[1];
      if (url) announce(url);
    }
    fail(new Error(`server exited (${await process.exited}): ${stderr}`));
  })().catch((error) => fail(error));
  try {
    return { url: await ready, close, exited: process.exited, pid: process.pid };
  } finally {
    clearTimeout(timeout);
  }
}

/** A preview WebSocket client; ReadableStream queues incoming messages. */
export function connectPreview(url: string) {
  const socket = new WebSocket(previewSocketUrl(url));
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason }), { once: true });
  });
  const reader = new ReadableStream<PreviewEvent>({
    start(controller) {
      socket.onmessage = ({ data }) => {
        try {
          controller.enqueue(JSON.parse(String(data)) as PreviewEvent);
        } catch (error) {
          controller.error(error);
          socket.close();
        }
      };
      socket.onerror = () => controller.error(new Error("WebSocket connection failed"));
      socket.onclose = ({ code }) => controller.error(new Error(`WebSocket closed (${code})`));
    },
  }).getReader();
  return {
    socket,
    closed,
    close: () => socket.close(),
    send: (command: PreviewCommand) => socket.send(JSON.stringify(command)),
    async next(): Promise<PreviewEvent> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error("WebSocket message timed out"));
              socket.close();
            }, 5000);
          }),
        ]);
        if (result.done) throw new Error("WebSocket stream ended");
        return result.value;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
