/** Native-server test and benchmark client; ReadableStream queues incoming messages. */
import type { PreviewCommand, PreviewEvent } from "../../pkgs/viewer/src/protocol.ts";

export function connectPreview(url: string) {
  const endpoint = new URL("/api/ws", url);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(endpoint);
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
