/** Generated assets only. Layers are ordered from back to front. */
export type PortraitKind = "fixed" | "toggle" | "select" | "blink" | "lip";
export interface PsdLayer {
  name: string;
  kind: PortraitKind;
  options: { name: string; frames: string[] }[];
  initial: string | boolean | null;
}
export interface PsdManifest {
  width: number;
  height: number;
  layers: PsdLayer[];
}
export const selectable = (kind: PortraitKind): boolean => kind !== "fixed" && kind !== "toggle";
export const animated = (kind: PortraitKind): boolean => kind === "blink" || kind === "lip";
export const assetFiles = (m: PsdManifest): string[] => m.layers.flatMap((l) => l.options.flatMap((o) => o.frames));
const reserved = new Set(["id", "at", "len", "children", "source", "key", "ref", "__proto__", "constructor", "prototype"]);
export function assetName(name: string, prop = false): string {
  if (
    !name ||
    /[<>:"/\\|?*\p{Cc}]/u.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(name) ||
    name === "." ||
    name === ".."
  )
    throw new Error(`Invalid layer name: ${name}`);
  if (prop && (!/^[$_\p{ID_Start}](?:[$_\p{ID_Continue}]|\u200c|\u200d)*$/u.test(name) || reserved.has(name)))
    throw new Error(`Invalid property name: ${name}`);
  return name;
}
export const safeAssetPath = (value: string): boolean =>
  value.endsWith(".png") && !/[\\:\p{Cc}]/u.test(value) && value.split("/").every((s) => s !== ".." && s !== "." && s !== "");
export function validateManifest(value: unknown): asserts value is PsdManifest {
  const m = value as PsdManifest;
  if (!Number.isInteger(m?.width) || m.width <= 0 || !Number.isInteger(m.height) || m.height <= 0 || !Array.isArray(m.layers) || !m.layers.length)
    throw new Error("Invalid PSD portrait manifest");
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const l of m.layers) {
    if (
      !l ||
      typeof l.name !== "string" ||
      names.has(l.name.toLowerCase()) ||
      !["fixed", "toggle", "select", "blink", "lip"].includes(l.kind) ||
      !Array.isArray(l.options) ||
      !l.options.length
    )
      throw new Error("Invalid or duplicate PSD portrait layer");
    assetName(l.name, l.kind !== "fixed");
    names.add(l.name.toLowerCase());
    const options = new Set<string>();
    for (const o of l.options) {
      if (
        !o ||
        typeof o.name !== "string" ||
        options.has(o.name.toLowerCase()) ||
        !Array.isArray(o.frames) ||
        !o.frames.length ||
        (!animated(l.kind) && o.frames.length !== 1)
      )
        throw new Error(`Invalid PSD option: ${l.name}`);
      assetName(o.name);
      options.add(o.name.toLowerCase());
      for (const src of o.frames) {
        if (typeof src !== "string" || !safeAssetPath(src) || paths.has(src.toLowerCase())) throw new Error(`Invalid PSD asset: ${l.name}`);
        paths.add(src.toLowerCase());
      }
    }
    if (selectable(l.kind) ? l.initial !== null && !l.options.some((o) => o.name === l.initial) : l.options.length !== 1 || typeof l.initial !== "boolean")
      throw new Error(`Invalid PSD default: ${l.name}`);
  }
  for (const path of paths) {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) if (paths.has(segments.slice(0, i).join("/"))) throw new Error(`PSD file/directory name collision: ${path}`);
  }
}
