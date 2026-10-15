import type { At, IntrinsicElements, Node } from "@mekuru/core";

export type Children = { children?: Node };

export type Line = Children & { id?: string; at?: At };

export const READING = { Mekuru: "めくる", bun: "バン" };

export const Subtitle = ({ stroke, children }: { stroke: string } & Children) => (
  <text x="50%" y="95%" anchor="b" max-w="90%" align="center" size={54} stroke={stroke} stroke-width={7} z={100}>
    {children}
  </text>
);

export type PortraitProps = Omit<IntrinsicElements["image"], "src">;

export const Portrait = (props: IntrinsicElements["image"]) => <image y="100%" anchor="b" h="80%" {...props} />;
