import type { At, Node } from "@mekuru/types";

export type Children = { children?: Node };

export type Line = Children & { id?: string; at?: At };

export const READING = { Mekuru: "めくる", bun: "バン" };

export { Subtitle } from "@mekuru/narrator";
