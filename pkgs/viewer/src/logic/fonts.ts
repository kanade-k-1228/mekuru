import type { TextOp } from "../protocol";

export const fileUrl = (src: string, revision?: string | null) =>
  `/files/${src.split("/").map(encodeURIComponent).join("/")}${revision ? `?v=${encodeURIComponent(revision)}` : ""}`;

export const fallbackFont = (font: string) => `${JSON.stringify(font)}, sans-serif`;
const faces = new Map<string, { family: string; face: FontFace; users: number }>();
let nextFamily = 0;

/** Ref cleanup releases the face when its last mounted text leaves the stage. */
export const attachTextFont = (el: HTMLElement, { font, fontSrc, fontRevision }: Pick<TextOp, "font" | "fontSrc" | "fontRevision">): (() => void) => {
  const fallback = fallbackFont(font);
  if (!fontSrc || typeof FontFace === "undefined") {
    el.style.fontFamily = fallback;
    return () => {};
  }
  const url = fileUrl(fontSrc, fontRevision);
  let entry = faces.get(url);
  if (!entry) {
    const family = `mekuru-preview-${nextFamily++}`;
    const face = new FontFace(family, `url(${JSON.stringify(url)})`);
    entry = { family, face, users: 0 };
    faces.set(url, entry);
    document.fonts.add(face);
    void face.load().catch(() => {});
  }
  entry.users++;
  el.style.fontFamily = `${JSON.stringify(entry.family)}, ${fallback}`;
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    if (--entry.users === 0) {
      document.fonts.delete(entry.face);
      faces.delete(url);
    }
  };
};
