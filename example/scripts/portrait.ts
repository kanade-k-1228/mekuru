import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "assets/character/pikao-tsuzumi");
const input = process.argv[2];
const source = input ? resolve(input) : join(ROOT, "../../engine/assets/character/pikao-tsuzumi");
const required = ["体/基本.png", "目/基本.png", "口/基本.0.png", "眉/基本.png", "髪/両手頬.ini"];
const ready = (dir: string) => required.every((file) => existsSync(join(dir, file)));

if (!ready(source)) {
  if (!input && ready(OUT)) process.exit(0);
  throw new Error(
    `立ち絵の部品がありません: ${source}\n` +
      "../engine で bun scripts/portrait.ts を実行するか、bun run portrait /path/to/pikao-tsuzumi で部品フォルダーを指定してください。",
  );
}

if (resolve(source) !== OUT) cpSync(source, OUT, { recursive: true });
console.log(`立ち絵の部品を準備しました: ${OUT}`);
