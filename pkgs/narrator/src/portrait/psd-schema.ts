/** Portable, generated PSD assets. Layers are ordered from back to front. */
export interface PsdLayer {
  name: string;
  kind: "fixed" | "flag" | "select";
  options: { name: string; src: string }[];
  initial: string | boolean | null;
}
export interface PsdManifest {
  version: 1;
  width: number;
  height: number;
  layers: PsdLayer[];
  /** All generated PNGs, including nested source layers. */
  files?: string[];
}
export const safeAssetPath = (value: string): boolean =>
  value.endsWith(".png") && !/[\\:\p{Cc}]/u.test(value) && value.split("/").every((s) => s !== ".." && s !== "." && s !== "");
export function validateManifest(value: unknown): asserts value is PsdManifest {
  const m = value as PsdManifest;
  if (m?.version !== 1 || !Number.isInteger(m.width) || m.width <= 0 || !Number.isInteger(m.height) || m.height <= 0 || !Array.isArray(m.layers))
    throw new Error("Invalid PSD portrait manifest");
  if (
    m.files !== undefined &&
    (!Array.isArray(m.files) || m.files.some((p) => typeof p !== "string" || !safeAssetPath(p)) || new Set(m.files).size !== m.files.length)
  )
    throw new Error("Invalid PSD generated file list");
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const l of m.layers) {
    if (
      !l ||
      typeof l.name !== "string" ||
      names.has(l.name) ||
      !["fixed", "flag", "select"].includes(l.kind) ||
      !Array.isArray(l.options) ||
      !l.options.length
    )
      throw new Error("Invalid PSD portrait layer");
    names.add(l.name);
    const options = new Set<string>();
    for (const o of l.options) {
      if (!o || typeof o.name !== "string" || options.has(o.name) || typeof o.src !== "string" || !safeAssetPath(o.src) || paths.has(o.src))
        throw new Error(`Invalid PSD asset: ${l.name}`);
      options.add(o.name);
      paths.add(o.src);
    }
    if (
      l.kind === "select"
        ? l.options.length < 2 || (l.initial !== null && !options.has(l.initial as string))
        : l.options.length !== 1 || typeof l.initial !== "boolean"
    )
      throw new Error(`Invalid PSD default: ${l.name}`);
  }
}
