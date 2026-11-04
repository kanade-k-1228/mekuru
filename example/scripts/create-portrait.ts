// Package the imagegen artwork into a simple PSD; this script does not draw it.
// Run explicitly with `bun run portrait:source`; normal builds preserve PSD edits.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writePsdBuffer, type Layer } from "ag-psd";
import sharp from "sharp";

const width = 600;
const height = 900;
const source = resolve(import.meta.dir, "../tutorial/assets/source/zundamon-sd-sheet.png");
const sheet = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const expressions = ["normal", "smile", "wink", "surprise", "worry", "smug"];
const children: Layer[] = [];

for (const [index, name] of expressions.entries()) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const left = Math.floor((col * sheet.info.width) / 3);
  const top = Math.floor((row * sheet.info.height) / 2);
  const cellWidth = Math.floor(((col + 1) * sheet.info.width) / 3) - left;
  const cellHeight = Math.floor(((row + 1) * sheet.info.height) / 2) - top;
  // Ignore nearly invisible alpha noise when locating each sprite's bounds.
  let x0 = cellWidth;
  let y0 = cellHeight;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < cellHeight; y++) {
    for (let x = 0; x < cellWidth; x++) {
      if (sheet.data[((top + y) * sheet.info.width + left + x) * 4 + 3] <= 8) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error(`Empty expression: ${name}`);
  x0 = Math.max(0, x0 - 4);
  y0 = Math.max(0, y0 - 4);
  x1 = Math.min(cellWidth - 1, x1 + 4);
  y1 = Math.min(cellHeight - 1, y1 + 4);
  // Preserve generated alpha; crop and fit only, with no redrawing.
  const cell = await sharp(sheet.data, { raw: sheet.info })
    .extract({ left: left + x0, top: top + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toBuffer();
  const data = await sharp(cell)
    .resize(width - 40, height - 60, { fit: "contain", background: "#00000000" })
    .extend({ left: 20, right: 20, top: 30, bottom: 30, background: "#00000000" })
    .raw()
    .toBuffer();
  children.push({ name, hidden: index !== 0, top: 0, left: 0, bottom: height, right: width, imageData: { width, height, data: new Uint8ClampedArray(data) } });
}

const output = resolve(import.meta.dir, "../tutorial/assets/source/zundamon.psd");
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(output, writePsdBuffer({ width, height, children: [{ name: "face [select]", children }], imageData: children[0].imageData }));
console.log(`SD ずんだもんの6表情を PSD にまとめました: ${output}`);
