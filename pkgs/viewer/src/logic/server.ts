import { atom } from "jotai";
import type { PreviewCommand, PreviewEvent, SceneElement, StateDto, TimelineClip, TimelineNode } from "../protocol";
import { applyEvent, previewSocketUrl, type PreviewState } from "./preview";

export type ConnState = "connecting" | "open" | "reconnecting";
interface Connection extends PreviewState {
  conn: ConnState;
  server: StateDto | null;
  previewError: string | null;
}
type Update = (state: Connection) => Connection;

/** The requested playback position; accepting a shorter preview clamps it. */
export const seekTimeAtom = atom(0);

const connect = (set: (update: Update) => void) => {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disconnect = () => {
    const source = socket;
    socket = null;
    clearTimeout(timer);
    source?.close();
  };
  const open = () => {
    const source = new WebSocket(previewSocketUrl(globalThis.location?.href ?? "http://localhost"));
    socket = source;
    let phase: "waiting" | "ready" | "resyncing" = "waiting";
    const active = () => socket === source;
    const reconnect = (error?: string) => {
      if (!active()) return;
      disconnect();
      set((s) => ({ ...s, conn: "reconnecting", previewError: error ?? s.previewError }));
      timer = setTimeout(open, 1000);
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
          // applyEvent throws before anything is stored, so a rejected event leaves the last good preview.
          set((s) => ({ ...s, ...applyEvent(s, event), conn: "open", server: event.state, previewError: null }));
          phase = "ready";
          clearTimeout(timer);
        } else throw new Error("unknown preview event");
      } catch (e) {
        resync(e instanceof Error ? e.message : String(e));
      }
    };
  };
  open();
  return disconnect;
};

const connectionAtom = atom<Connection>({ conn: "connecting", server: null, preview: null, resources: {}, previewError: null });
const eventsAtom = atom(
  (get) => get(connectionAtom),
  (get, set, update: Update) => {
    const next = update(get(connectionAtom));
    set(connectionAtom, next);
    if (next.preview) set(seekTimeAtom, Math.min(get(seekTimeAtom), next.preview.duration));
  },
);
eventsAtom.onMount = connect;

export const connAtom = atom((get) => get(eventsAtom).conn);
export const serverAtom = atom((get) => get(eventsAtom).server);
export const previewAtom = atom((get) => get(eventsAtom).preview);
export const previewErrorAtom = atom((get) => get(eventsAtom).previewError);
export const durationAtom = atom((get) => get(previewAtom)?.duration ?? 0);
export const fpsAtom = atom((get) => get(previewAtom)?.fps ?? 30);

const EMPTY_ELEMENTS: SceneElement[] = [];
const EMPTY_NODES: TimelineNode[] = [];
const EMPTY_CLIPS: TimelineClip[] = [];
export const elementsAtom = atom((get) => get(previewAtom)?.elements ?? EMPTY_ELEMENTS);
export const nodesAtom = atom((get) => get(previewAtom)?.nodes ?? EMPTY_NODES);
export const clipsAtom = atom((get) => get(previewAtom)?.clips ?? EMPTY_CLIPS);

export const resourcesAtom = atom((get) => get(eventsAtom).resources);
