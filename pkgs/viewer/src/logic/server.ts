import type { SceneElement, TimelineDto } from "@mekuru/protocol";
import { atom } from "jotai";

import { seekTimeAtom } from "./playback/position";
import { connectEvents, initialConnection, type Connection } from "./events";
export type { ConnState } from "./events";

const connectionAtom = atom<Connection>(initialConnection);
const eventsAtom = atom(
  (get) => get(connectionAtom),
  (get, set, update: (state: Connection) => Connection) => {
    const before = get(connectionAtom);
    const next = update(before);
    set(connectionAtom, next);
    if (next.preview && before.preview && next.preview.duration < before.preview.duration) {
      set(seekTimeAtom, Math.min(get(seekTimeAtom), next.preview.duration));
    }
  },
);
eventsAtom.onMount = (set) => connectEvents(set);

export const connAtom = atom((get) => get(eventsAtom).conn);
export const serverAtom = atom((get) => get(eventsAtom).server);
export const scheduleAtom = atom((get) => get(eventsAtom).preview);
export const previewLoadingAtom = atom((get) => {
  const { server, previewVersion, previewError } = get(eventsAtom);
  return !!server && !previewError && server.previewVersion !== 0 && server.previewVersion !== previewVersion;
});
export const previewErrorAtom = atom((get) => get(eventsAtom).previewError);
export const durationAtom = atom((get) => get(scheduleAtom)?.duration ?? 0);
export const fpsAtom = atom((get) => get(scheduleAtom)?.fps ?? 30);

const EMPTY_ELEMENTS: SceneElement[] = [];
const EMPTY_TIMELINE: TimelineDto = { nodes: [], clips: [] };
export const elementsAtom = atom((get) => get(scheduleAtom)?.elements ?? EMPTY_ELEMENTS);
export const timelineAtom = atom((get) => get(scheduleAtom)?.timeline ?? EMPTY_TIMELINE);
