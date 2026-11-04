import type { At, Node } from "@mekuru/tsx";

export type Children = { children?: Node };

export type Line = { id?: string; at?: At; text: Node };

export const READING = { Mekuru: "めくる", bun: "バン" };

export { Subtitle } from "@mekuru/narrator";
