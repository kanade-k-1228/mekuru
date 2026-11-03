import type { At, IntrinsicElements, Node } from "@mekuru/core";

export type Children = { children?: Node };

export type Line = Children & { id?: string; at?: At };

export const READING = { Mekuru: "めくる", bun: "バン" };

export { Subtitle } from "@mekuru/narrator";

export type PortraitProps = Omit<IntrinsicElements["image"], "src">;

export const Portrait = (props: IntrinsicElements["image"]) => <image y="100%" anchor="b" h="80%" {...props} />;
