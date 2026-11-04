export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  line: number;
  message: string;
}
/** Compilation status; it never contains drawing data. */
export interface StateDto {
  path: string;
  version: number;
  previewVersion: number;
  status: "building" | "ready" | "error";
  error: string | null;
  diagnostics: Diagnostic[];
}

export type Keyed<T> = T & { key: string };
export type Resources = Record<string, DrawOp[]>;
export interface CollectionPatch<T> {
  upsert: T[];
  remove: string[];
  order?: string[];
}
export interface SnapshotEvent {
  type: "snapshot";
  state: StateDto;
  preview: PreviewDto | null;
  resources: Resources;
}
export interface StatusEvent {
  type: "status";
  state: StateDto;
}
export interface PatchEvent {
  type: "patch";
  state: StateDto;
  baseVersion: number;
  version: number;
  scene: Pick<PreviewDto, "width" | "height" | "fps" | "duration">;
  elements: CollectionPatch<SceneElement>;
  nodes: CollectionPatch<Keyed<TimelineNode>>;
  clips: CollectionPatch<Keyed<TimelineClip>>;
  resources: Resources;
}
export type PreviewEvent = SnapshotEvent | StatusEvent | PatchEvent;
/** Browser-to-server JSON message over /api/ws. */
export type PreviewCommand = { type: "resync" };

export interface PreviewDto {
  version: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
  elements: SceneElement[];
  timeline: TimelineDto;
}
export type Bounds = [number, number, number, number];
export type Fade = [start: number, end: number, fadeIn: number, fadeOut: number, level: number];
export interface TextOp {
  kind: "text";
  text: string;
  x: number;
  y: number;
  width: number | null;
  font: string;
  fontSrc: string | null;
  fontRevision: string | null;
  size: number;
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
  lineHeight: number;
  stroke: string | null;
  strokeWidth: number;
  transform: [number, number, number, number, number, number] | null;
}
export type DrawOp =
  | TextOp
  | {
      kind: "path";
      d: string;
      color: string;
      stroke: { width: number; lineCap: "butt" | "round" | "square"; lineJoin: "miter" | "round" | "bevel"; dash: number[] } | null;
    }
  | { kind: "image"; src: string; revision: string; bounds: Bounds; transform: [number, number, number, number, number, number] | null };
export interface MediaMap {
  from: number;
  end: number;
  segments: [outStart: number, outEnd: number, srcStart: number, rate: number][];
}
export interface SceneElement {
  key: string;
  id: number;
  kind: "view" | "video" | "audio";
  start: number;
  end: number;
  opacity: number;
  fades: Fade[];
  drawings: string[];
  bounds: Bounds | null;
  media: { src: string; revision: string; gain: number; map: MediaMap } | null;
  repeat: [from: number, period: number, until: number][];
  hidden: [start: number, end: number][];
}

export interface TimelineNode {
  key: string;
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
  key: string;
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
