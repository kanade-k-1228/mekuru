import type { StateDto } from "@mekuru/protocol";
export type ConnState = "connecting" | "open" | "reconnecting";
export interface Connection {
  conn: ConnState;
  server: StateDto | null;
}
export const connectEvents = (set: (update: (state: Connection) => Connection) => void) => {
  let es: EventSource;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    es = new EventSource("/api/events");
    es.onopen = () => set((s) => ({ ...s, conn: "open" }));
    es.onerror = () => {
      set((s) => ({ ...s, conn: "reconnecting" }));
      if (es.readyState === EventSource.CLOSED) retry = setTimeout(connect, 1000);
    };
    es.addEventListener("state", (ev) => {
      const server = JSON.parse((ev as MessageEvent<string>).data) as StateDto;
      set(() => ({ conn: "open", server }));
    });
  };
  connect();
  return () => {
    clearTimeout(retry);
    es.close();
  };
};
