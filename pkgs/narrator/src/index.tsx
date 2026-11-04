/** @jsxImportSource @mekuru/tsx */
import type { IntrinsicElements } from "@mekuru/tsx";
export * from "./portrait/index.tsx";

export type SubtitleProps = IntrinsicElements["text"];

export const Subtitle = (props: SubtitleProps) => (
  <text x="50%" y="95%" anchor="b" max-w="90%" align="center" size={54} color="white" stroke="black" stroke-width={7} z={100} {...props} />
);
