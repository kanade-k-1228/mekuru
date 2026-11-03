export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  line: number;
  message: string;
}
export interface Compilation {
  preview: PreviewDto | null;
  diagnostics: Diagnostic[];
}
export interface StateDto {
  path: string;
  version: number;
  previewVersion: number;
  status: "building" | "ready" | "error";
  error: string | null;
  diagnostics: Diagnostic[];
  preview: PreviewDto | null;
}

export interface PreviewDto {
  width: number;
  height: number;
  fps: number;
  duration: number;
  elements: SceneElement[];
  timeline: TimelineDto;
}
export type Bounds = [number, number, number, number];
export type Fade = [start: number, end: number, fadeIn: number, fadeOut: number, level: number];
export type DrawOp =
  | {
      kind: "path";
      d: string;
      color: string;
      stroke: { width: number; lineCap: "butt" | "round" | "square"; lineJoin: "miter" | "round" | "bevel"; dash: number[] } | null;
    }
  | { kind: "image"; src: string; bounds: Bounds; transform: [number, number, number, number, number, number] | null };
export interface MediaMap {
  from: number;
  end: number;
  segments: [outStart: number, outEnd: number, srcStart: number, rate: number][];
}
export interface SceneElement {
  id: number;
  kind: "view" | "video" | "audio";
  start: number;
  end: number;
  opacity: number;
  fades: Fade[];
  ops: DrawOp[];
  bounds: Bounds | null;
  media: { src: string; gain: number; map: MediaMap } | null;
  repeat: [from: number, period: number, until: number][];
  hidden: [start: number, end: number][];
}

export interface TimelineNode {
  id: number;
  parent: number | null;
  depth: number;
  kind: "seq" | "par" | "repeat";
  tag: string;
  label: string;
  line: number;
  start: number;
  end: number;
  pin: number | null;
}

export type ClipLane = "speech" | "visual" | "video" | "audio";

export interface TimelineClip {
  tag: string;
  lane: ClipLane;
  line: number;
  start: number;
  end: number;
  label: string;
  estimated: boolean;
  freezes: [start: number, end: number][];
}

export interface TimelineDto {
  nodes: TimelineNode[];
  clips: TimelineClip[];
}
