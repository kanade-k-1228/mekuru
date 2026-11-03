import type { PreviewCommand, PreviewDto, PreviewEvent, Resources, StateDto } from "@mekuru/protocol";
import { previewStore } from "./preview";
export type ConnState = "connecting" | "open" | "reconnecting";
export interface Connection {
  conn: ConnState;
  server: StateDto | null;
  preview: PreviewDto | null;
  resources: Resources;
  previewError: string | null;
}
export const initialConnection: Connection = { conn: "connecting", server: null, preview: null, resources: {}, previewError: null };

export const previewSocketUrl = (href: string): string => {
  const url = new URL("/api/ws", href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
};

export const connectEvents = (set: (update: (state: Connection) => Connection) => void) => {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const store = previewStore();
  const disconnect = () => {
    const source = socket;
    socket = null;
    clearTimeout(timer);
    source?.close();
  };
  const connect = () => {
    const source = new WebSocket(previewSocketUrl(globalThis.location?.href ?? "http://localhost"));
    socket = source;
    let phase: "waiting" | "ready" | "resyncing" = "waiting";
    const active = () => socket === source;
    const reconnect = (error?: string) => {
      if (!active()) return;
      disconnect();
      set((s) => ({ ...s, conn: "reconnecting", previewError: error ?? s.previewError }));
      timer = setTimeout(connect, 1000);
    };
    const resync = (error: string) => {
      if (!active() || phase === "resyncing") return;
      phase = "resyncing";
      set((s) => ({ ...s, conn: "reconnecting", previewError: error }));
      try {
        source.send(JSON.stringify({ type: "resync" } satisfies PreviewCommand));
        timer = setTimeout(() => reconnect("preview resynchronization timed out"), 3000);
      } catch {
        reconnect(error);
      }
    };
    source.onopen = () => {
      if (active()) set((s) => ({ ...s, conn: "open" }));
    };
    source.onerror = source.onclose = () => reconnect();
    source.onmessage = (ev: MessageEvent<string>) => {
      if (!active()) return;
      try {
        const event = JSON.parse(ev.data) as PreviewEvent;
        if (event.type === "status") {
          set((s) => ({ ...s, server: event.state }));
        } else if (event.type === "snapshot" || event.type === "patch") {
          if (event.type === "patch" && phase !== "ready") return;
          const preview = store.apply(event);
          phase = "ready";
          clearTimeout(timer);
          set((s) => ({ ...s, conn: "open", server: event.state, preview, resources: store.resources, previewError: null }));
        } else throw new Error("unknown preview event");
      } catch (e) {
        resync(e instanceof Error ? e.message : String(e));
      }
    };
  };
  connect();
  return disconnect;
};
