/** @jsxImportSource @mekuru/core */
import type { IntrinsicElements } from "@mekuru/core";
import { subtitleText } from "@mekuru/speech";

export { subtitleText } from "@mekuru/speech";

export type SubtitleProps = IntrinsicElements["text"];

export const Subtitle = ({ children, ...props }: SubtitleProps) => (
  <text x="50%" y="95%" anchor="b" max-w="90%" align="center" size={54} color="white" stroke="black" stroke-width={7} z={100} {...props}>
    {subtitleText(children)}
  </text>
);
