import { atom } from "jotai";

// Kept separately so accepting a shorter preview can clamp the stored position.
export const seekTimeAtom = atom(0);
