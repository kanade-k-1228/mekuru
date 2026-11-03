import { expect, test } from "bun:test";
import { attachTextFont, fileUrl } from "../src/logic/fonts";

test("font revisions share only matching faces, fall back on failure, and release the last reference", async () => {
  const previousFace = Object.getOwnPropertyDescriptor(globalThis, "FontFace");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const fonts = new Set();
  const created: { family: string; source: string }[] = [];
  class Face {
    family: string;
    source: string;
    constructor(family: string, source: string) {
      this.family = family;
      this.source = source;
      created.push(this);
    }
    load() {
      return this.source.includes("missing") ? Promise.reject(new Error("missing font")) : Promise.resolve(this);
    }
  }
  Object.defineProperty(globalThis, "FontFace", { configurable: true, value: Face });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { fonts } });
  const releases: (() => void)[] = [];
  const element = () => ({ style: { fontFamily: "" } }) as HTMLElement;
  const op = { font: "Custom Font", fontSrc: "fonts/日本 語.ttf", fontRevision: "first" };
  try {
    const a = element(),
      b = element(),
      c = element();
    releases.push(attachTextFont(a, op), attachTextFont(b, op));
    expect(fonts.size).toBe(1);
    expect(a.style.fontFamily).toBe(b.style.fontFamily);
    expect(created[0].source).toContain(fileUrl(op.fontSrc, "first"));
    releases.push(attachTextFont(c, { ...op, fontRevision: "second" }));
    expect(fonts.size).toBe(2);
    expect(c.style.fontFamily).not.toBe(a.style.fontFamily);
    releases[0]();
    releases[0](); // Ref cleanup is safe to repeat.
    expect(fonts.size).toBe(2);
    releases[1]();
    expect(fonts.size).toBe(1);
    const fallback = element();
    releases.push(attachTextFont(fallback, { ...op, fontSrc: "missing.ttf" }));
    await Promise.resolve();
    expect(fallback.style.fontFamily).toContain('"Custom Font", sans-serif');
    releases.push(attachTextFont(fallback, { ...op, fontSrc: null }));
    expect(fallback.style.fontFamily).toBe('"Custom Font", sans-serif');
  } finally {
    for (const release of releases) release();
    expect(fonts.size).toBe(0);
    if (previousFace) Object.defineProperty(globalThis, "FontFace", previousFace);
    else Reflect.deleteProperty(globalThis, "FontFace");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
