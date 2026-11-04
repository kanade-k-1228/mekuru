import type { DrawOp, Resources, SceneElement, StateDto, PreviewDto } from "../../src/protocol";
export const path = (d: string): DrawOp => ({ kind: "path", d, color: "#000000ff", stroke: null });
export const resources: Resources = { A: [path("M0 0L1 1".repeat(100))], B: [path("M0 0L2 2".repeat(100))], C: [path("M0 0L3 3".repeat(100))] };
export const element = (key: string, drawings: string[], start = 0): SceneElement => ({
  key,
  id: Number(key.replace(/\D/g, "")),
  kind: "view",
  start,
  end: start + 1,
  opacity: 1,
  fades: [],
  drawings,
  bounds: null,
  media: null,
  repeat: [],
  hidden: [],
});
export const compilation = (version = 1, elements = [element("e0", ["A", "B"]), element("e1", ["A"], 1)], available = resources): FixtureCompilation => ({
  version,
  diagnostics: [],
  resources: available,
  stats: { drawHits: 0, drawMisses: 2, compileMs: 1 },
  preview: { width: 100, height: 100, fps: 30, duration: 2, elements, timeline: { nodes: [], clips: [] } },
});
export const state = (version = 1): StateDto => ({ path: "video.xml", version, previewVersion: version, status: "ready", error: null, diagnostics: [] });

export interface FixtureCompilation {
  version: number;
  diagnostics: StateDto["diagnostics"];
  preview: Omit<PreviewDto, "version"> | null;
  resources: Resources;
  stats: { drawHits: number; drawMisses: number; compileMs: number };
}
