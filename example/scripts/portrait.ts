import { resolve } from "node:path";
import { exportPsd } from "@mekuru/narrator/psd";

const root = resolve(import.meta.dir, "..");
const source = process.argv[2] ? resolve(process.argv[2]) : resolve(root, "tutorial/assets/source/zundamon.psd");
const output = resolve(root, "tutorial/assets/character/zundamon");

await exportPsd(source, output);
console.log(`PSD から立ち絵を展開しました: ${output}`);
