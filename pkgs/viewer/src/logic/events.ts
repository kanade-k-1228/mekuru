import type { PreviewDto, PreviewEvent, StateDto } from "@mekuru/protocol";
import { previewStore } from "./preview";
export type ConnState = "connecting" | "open" | "reconnecting";
export interface Connection {
  conn: ConnState;
  server: StateDto | null;
  preview: PreviewDto | null;
  previewVersion: number;
  previewError: string | null;
}
export const initialConnection: Connection = { conn: "connecting", server: null, preview: null, previewVersion: 0, previewError: null };

export const connectEvents = (set: (update: (state: Connection) => Connection) => void) => {
  let es: EventSource;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const store = previewStore();
  const connect = () => {
    if (closed) return;
    const source = new EventSource("/api/events");
    es = source;
    let accepting = true;
    const active = () => accepting && !closed && es === source;
    const reconnect = (error?: string) => {
      if (!active()) return;
      accepting = false;
      source.close();
      set((s) => ({ ...s, conn: "reconnecting", previewError: error ?? s.previewError }));
      clearTimeout(retry);
      retry = setTimeout(connect, 1000);
    };
    source.onopen = () => {
      if (active()) set((s) => ({ ...s, conn: "open" }));
    };
    source.onerror = () => reconnect();
    const receive = (ev: Event) => {
      if (!active()) return;
      try {
        const event = JSON.parse((ev as MessageEvent<string>).data) as PreviewEvent;
        if (event.type === "status") {
          set((s) => ({ ...s, conn: "open", server: event.state }));
        } else if (event.type === "snapshot" || event.type === "patch") {
          const preview = store.apply(event);
          const version = event.type === "snapshot" ? (event.preview?.version ?? 0) : event.version;
          set((s) => ({ ...s, conn: "open", server: event.state, preview, previewVersion: version, previewError: null }));
        } else throw new Error("unknown preview event; reconnecting");
      } catch (e) {
        reconnect(e instanceof Error ? e.message : String(e));
      }
    };
    for (const type of ["snapshot", "status", "patch"]) source.addEventListener(type, receive);
  };
  connect();
  return () => {
    closed = true;
    clearTimeout(retry);
    es.close();
  };
};
