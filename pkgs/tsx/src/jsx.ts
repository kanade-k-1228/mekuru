import type { JsxNode, Node } from "./runtime.ts";
export type { Node } from "./runtime.ts";

export type Length = number | `${number}%` | "auto";
type Ratio = number | `${number}%`;
export type Time = number;
export type At = number | string;
export type Color = string;
export type Anchor = "tl" | "t" | "tr" | "l" | "c" | "r" | "bl" | "b" | "br" | "center" | "top" | "bottom" | "left" | "right";

interface Base {
  key?: string | number;
}

interface WithChildren {
  children?: Node;
}

interface Timed {
  id?: string;
  at?: At;
  fadein?: Time;
  fadeout?: Time;
  slot?: string;
}

interface Look {
  z?: number;
  opacity?: Ratio;
}

interface Box {
  x?: Length;
  y?: Length;
  anchor?: Anchor;
  w?: Length;
  h?: Length;
  "min-w"?: Length;
  "max-w"?: Length;
  "min-h"?: Length;
  "max-h"?: Length;
  grow?: boolean | number;
  shrink?: number;
  rotate?: number;
}

interface Deco {
  fill?: Color;
  stroke?: Color;
  "stroke-width"?: number;
  radius?: number;
}

type Align = "start" | "center" | "end" | "stretch";

interface Overlay extends Base, Timed, Look, Box, Deco, WithChildren {
  padding?: Length | readonly Length[];
  align?: Align;
}

interface Flow extends Overlay {
  gap?: Length;
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  wrap?: boolean;
}

interface TextStyle {
  size?: number;
  color?: Color;
  font?: string;
  stroke?: Color;
  "stroke-width"?: number;
  "line-height"?: number;
  background?: Color;
  radius?: number;
  padding?: Length | readonly Length[];
}

interface Media {
  src: string;
  from?: Time;
  to?: Time;
  volume?: Ratio;
  children?: Node;
}

export interface IntrinsicElements {
  mekuru: Base &
    WithChildren & {
      size?: `${number}x${number}`;
      fps?: number;
      font?: string;
      lang?: string;
      preset?: string;
      crf?: number;
      "audio-bitrate"?: string;
    };
  seq: Overlay;
  stack: Overlay;
  row: Flow;
  column: Flow;
  repeat: Base & Timed & Look & WithChildren;
  dur: Base & Timed & Look & WithChildren & { len: Time };

  text: Base & Timed & Look & Box & TextStyle & { text: string; weight?: "normal" | "bold"; align?: "left" | "center" | "right" };
  image: Base & Timed & Look & Box & { src: string };
  video: Base & Timed & Look & Omit<Box, "rotate"> & Media;
  audio: Base & Omit<Timed, "slot"> & Omit<Media, "src"> & { src?: string; label?: string; draft?: boolean };
  hold: Base & WithChildren & Look & { at: Time; id?: string; fadein?: Time; fadeout?: Time; slot?: string };
  speed: Base & { from?: Time; to?: Time; rate: number };
  cut: Base & { from?: Time; to?: Time };
  rect: Base & Timed & Look & Box & Deco;
  circle: Base & Timed & Look & Box & Deco;
  line: Base &
    Timed &
    Look & {
      p: string;
      closed?: boolean;
      fill?: Color;
      stroke?: Color;
      "stroke-width"?: number;
      head?: "none" | "start" | "end" | "both";
      dashed?: boolean;
      dotted?: boolean;
    };
}

export namespace JSX {
  export type Element = JsxNode | Promise<JsxNode>;
  export type ElementType = keyof IntrinsicElements | ((props: never) => Node);
  export interface ElementChildrenAttribute {
    children: Node;
  }
  export interface IntrinsicAttributes {
    key?: string | number | bigint | null;
  }
  export interface IntrinsicElements extends IntrinsicElementsBase {}
}

type IntrinsicElementsBase = IntrinsicElements;
