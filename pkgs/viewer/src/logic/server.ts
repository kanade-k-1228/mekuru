import { atom } from "jotai";
import type { StateDto } from "@mekuru/protocol";

import { connectEvents, type ConnState } from "./events";
export type { ConnState } from "./events";

const eventsAtom = atom<{ conn: ConnState; server: StateDto | null }>({ conn: "connecting", server: null });
eventsAtom.onMount = connectEvents;

export const connAtom = atom((get) => get(eventsAtom).conn);
export const serverAtom = atom((get) => get(eventsAtom).server);
export const scheduleAtom = atom((get) => get(serverAtom)?.preview ?? null);
export const durationAtom = atom((get) => get(scheduleAtom)?.duration ?? 0);
export const fpsAtom = atom((get) => get(scheduleAtom)?.fps ?? 30);
