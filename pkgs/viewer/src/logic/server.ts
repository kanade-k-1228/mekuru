import { atom } from "jotai";
import type { StateDto } from "@mekuru/cli/protocol";

export type ConnState = "connecting" | "open" | "reconnecting";

const eventsAtom = atom<{ conn: ConnState; server: StateDto | null }>({ conn: "connecting", server: null });
eventsAtom.onMount = (set) => {
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
      const name = server.path.split(/[\\/]/).pop() ?? server.path;
      document.title = name ? `${name} — Mekuru Movie Maker` : "Mekuru Movie Maker";
      set({ conn: "open", server });
    });
  };
  connect();
  return () => {
    clearTimeout(retry);
    es.close();
  };
};

export const connAtom = atom((get) => get(eventsAtom).conn);
export const serverAtom = atom((get) => get(eventsAtom).server);
export const scheduleAtom = atom((get) => get(serverAtom)?.preview ?? null);
export const durationAtom = atom((get) => get(scheduleAtom)?.duration ?? 0);
export const fpsAtom = atom((get) => get(scheduleAtom)?.fps ?? 30);
