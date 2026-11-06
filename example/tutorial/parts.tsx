import type { At, Node } from "@mekuru/tsx";
export { Subtitle } from "@mekuru/narrator";

export type Line = { text: Node; id?: string; at?: At };
export const READING = { Mekuru: "めくる", bun: "バン", TSX: "ティーエスエックス", irodoru: "いろどる" };
