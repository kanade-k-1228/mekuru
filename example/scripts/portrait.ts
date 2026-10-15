import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { initializeCanvas, readPsd, type Layer } from "ag-psd";

const ROOT = join(import.meta.dir, "..");
const URL = "https://drive.usercontent.google.com/download?id=1MTWXJJupQU-_7uaQPARv4tBXyDY9w0eY&export=download&confirm=t";
const ZIP = join(ROOT, ".mekuru/cache/portrait/Sasara_v1.0.zip");
const PSD = "Sasara_v1.0/Sasara_v1.0.psd";
const OUT = join(ROOT, "assets/character/sasara");
const STAMP = join(OUT, "parts.json");

const CROP = [250, 140, 2030, 2240] as const;
const SCALE = 0.75;
const GLASSES: string | null = "ピンク";

type Ref = readonly string[];
const arms = (name: string): Ref[] => [
  ["!Body", "*通常衣装"],
  ["!腕ポーズ", "*通常衣装腕", `*${name}`],
];
const eye = (name: string): Ref[] => [["!表情", "!目", `*${name}`]];
const mouth = (name: string): Ref[] => [["!表情", "!口", `*${name}`]];
const brow = (name: string): Ref[] => [["!表情", "!眉", `*${name}`], ...(GLASSES ? [["表情オプション", "メガネ", `*${GLASSES}`]] : [])];
const cheek = (...names: string[]): Ref[] => names.map((n) => ["チーク類", n]);
const option = (...names: string[]): Ref[] => names.map((n) => ["表情オプション", n]);
const mark = (name: string): Ref[] => [["漫符", name]];

const PARTS: Record<string, Ref[]> = {
  "体/基本": arms("通常"),
  "体/指差し": arms("それはね_右腕B"),
  "体/指差し腰": arms("それはね_右腕"),
  "体/指立て": arms("それはね_左腕B"),
  "体/指立て腰": arms("それはね_左腕"),
  "体/考え": arms("えーと"),
  "体/腕組み": arms("腕組み"),
  "体/バンザイ": arms("バンザイ"),

  "顔色/ほんのり": cheek("チーク1", "頬ブラシ"),
  "顔色/照れ": cheek("赤面1", "赤面ブラシ"),
  "顔色/真っ赤": option("茹蛸"),

  "目/基本": eye("デフォルト目"),
  "目/基本.0": eye("閉じ_下弦"),
  "目/基本.1": eye("やや閉じ"),
  "目/笑い": eye("閉じ__笑い"),
  "目/ウインク": eye("ウインク左"),
  "目/驚き": eye("縮小目"),
  "目/ジト目": eye("やや閉じ"),
  "目/閉じ": eye("閉じ_下弦"),
  "目/キラキラ": eye("しいたけ"),
  "目/ハート": eye("ハート"),
  "目/うるうる": eye("ウルウル"),
  "目/ぐるぐる": eye("グルグル"),
  "目/点": eye("・・"),
  "目/ぎゅっ": eye("><"),
  "目/白目": eye("白目"),

  "口/基本": mouth("デフォルト開き"),
  "口/基本.0": mouth("デフォルト閉じ"),
  "口/基本.1": mouth("にへら"),
  "口/笑い": mouth("わぁ"),
  "口/笑い.0": mouth("デフォルト閉じ"),
  "口/笑い.1": mouth("にへら"),
  "口/お": mouth("わ"),
  "口/お.0": mouth("o"),
  "口/お.1": mouth("o(横)"),
  "口/困り": mouth("げっぱ類"),
  "口/困り.0": mouth("〜"),
  "口/困り.1": mouth("うへ"),
  "口/への字": mouth("^"),
  "口/にっ": mouth("にぃ"),
  "口/ねこ": mouth("ω"),
  "口/ぺろ": mouth("ぺろぉ"),
  "口/あわわ": mouth("あわわ"),

  "眉/基本": brow("眉デフォルト"),
  "眉/上がり": brow("やや上げ"),
  "眉/困り": brow("ハ"),
  "眉/怒り": brow("\\ /"),
  "眉/平ら": brow("--"),
  "眉/うーん": brow("うーん"),
  "眉/はぁ": brow("はぁ"),

  "他/ハート": mark("はーと"),
  "他/ビックリ": mark("!"),
  "他/はてな": mark("?"),
  "他/汗": mark("水滴"),
  "他/冷や汗": option("滝汗"),
  "他/涙": option("涙"),
  "他/青ざめ": option("青ざめ", "青ざめ(線)"),
  "他/キラキラ": mark("キラキラ"),
  "他/きらーん": mark("きぴーん"),
  "他/ひらめき": mark("notice"),
  "他/怒り": mark("怒"),
  "他/ムキー": mark("キーっ"),
  "他/音符": mark("音符"),
  "他/花": mark("花"),
  "他/もやもや": mark("う〜ん"),
  "他/ガタガタ": mark("ガタガタ"),
};

const stamp = JSON.stringify({ CROP, SCALE, PARTS }, null, 1);
if ((await Bun.file(STAMP).exists()) && (await Bun.file(STAMP).text()) === stamp) process.exit(0);

if (!(await Bun.file(ZIP).exists())) {
  console.log("立ち絵の素材をダウンロードしています（ささらちゃん立ち絵素材 v1.0 / しりんだーふれいる 様）…");
  const res = await fetch(URL);
  if (!res.ok || res.headers.get("content-type")?.startsWith("text/html")) {
    throw new Error(`立ち絵の素材をダウンロードできませんでした（${res.status}）。配布ページ: https://seiga.nicovideo.jp/seiga/im10852558`);
  }
  mkdirSync(dirname(ZIP), { recursive: true });
  await Bun.write(ZIP, Buffer.from(await res.arrayBuffer()));
}

const unzip = (zip: Buffer, name: string): Buffer => {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = zip.readUInt32LE(end + 16);
  for (let i = zip.readUInt16LE(end + 10); i > 0; i--) {
    const [method, size, nameLen] = [zip.readUInt16LE(at + 10), zip.readUInt32LE(at + 20), zip.readUInt16LE(at + 28)];
    const local = zip.readUInt32LE(at + 42);
    if (zip.toString("utf8", at + 46, at + 46 + nameLen) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 0 ? data : Buffer.from(Bun.inflateSync(new Uint8Array(data)));
    }
    at += 46 + nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  throw new Error(`${ZIP} に ${name} がありません`);
};

type ImageData = ReturnType<NonNullable<Parameters<typeof initializeCanvas>[1]>>;
initializeCanvas(
  () => {
    throw new Error("canvas is not available");
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }) as ImageData,
);
const psd = readPsd(unzip(Buffer.from(await Bun.file(ZIP).arrayBuffer()), PSD), { skipCompositeImageData: true, skipThumbnail: true, useImageData: true });

const layers = new Map<string, { layer: Layer; order: number; opacity: number }>();
const walk = (children: Layer[] | undefined, path: string[], opacity: number) => {
  for (const layer of children ?? []) {
    const at = [...path, layer.name ?? ""];
    const o = opacity * (layer.opacity ?? 1);
    if (layer.children) walk(layer.children, at, o);
    else layers.set(at.join("/"), { layer, order: layers.size, opacity: o });
  }
};
walk(psd.children, [], 1);

const [X0, Y0, X1, Y1] = CROP;
const [CW, CH] = [X1 - X0, Y1 - Y0];
const [W, H] = [Math.round(CW * SCALE), Math.round(CH * SCALE)];

const compose = (refs: Ref[]): Float32Array => {
  const px = new Float32Array(CW * CH * 4);
  const found = refs.map((ref) => {
    const l = layers.get(ref.join("/"));
    if (!l) throw new Error(`PSD にレイヤー ${ref.join("/")} がありません`);
    return l;
  });
  for (const { layer, opacity } of found.sort((a, b) => a.order - b.order)) {
    const img = layer.imageData;
    if (!img) continue;
    const [left, top] = [layer.left ?? 0, layer.top ?? 0];
    for (let y = Math.max(top, Y0); y < Math.min(top + img.height, Y1); y++) {
      for (let x = Math.max(left, X0); x < Math.min(left + img.width, X1); x++) {
        const s = ((y - top) * img.width + (x - left)) * 4;
        const a = (img.data[s + 3] / 255) * opacity;
        if (a === 0) continue;
        const d = ((y - Y0) * CW + (x - X0)) * 4;
        for (let c = 0; c < 3; c++) px[d + c] = (img.data[s + c] / 255) * a + px[d + c] * (1 - a);
        px[d + 3] = a + px[d + 3] * (1 - a);
      }
    }
  }
  return px;
};

const spans = (n: number, m: number): [number, number][][] =>
  Array.from({ length: m }, (_, j) => {
    const [a, b] = [(j * n) / m, ((j + 1) * n) / m];
    const out: [number, number][] = [];
    for (let i = Math.floor(a); i < Math.min(n, Math.ceil(b)); i++) out.push([i, ((Math.min(b, i + 1) - Math.max(a, i)) * m) / n]);
    return out;
  });
const SX = spans(CW, W);
const SY = spans(CH, H);
const shrink = (px: Float32Array): Float32Array => {
  const mid = new Float32Array(W * CH * 4);
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < W; x++) {
      const d = (y * W + x) * 4;
      for (const [i, k] of SX[x]) for (let c = 0; c < 4; c++) mid[d + c] += px[(y * CW + i) * 4 + c] * k;
    }
  }
  const out = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (const [i, k] of SY[y]) {
      for (let x = 0; x < W * 4; x++) out[y * W * 4 + x] += mid[i * W * 4 + x] * k;
    }
  }
  return out;
};

const chunk = (type: string, data: Buffer) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(Bun.hash.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const png = async (px: Float32Array): Promise<Buffer> => {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [s, d] = [(y * W + x) * 4, y * (W * 4 + 1) + 1 + x * 4];
      const a = Math.min(1, px[s + 3]);
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) raw[d + c] = Math.round(Math.min(1, px[s + c] / a) * 255);
      raw[d + 3] = Math.round(a * 255);
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0);
  head.writeUInt32BE(H, 4);
  head.set([8, 6, 0, 0, 0], 8);
  const compressed = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", Buffer.from(compressed)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

rmSync(OUT, { recursive: true, force: true });
for (const [part, refs] of Object.entries(PARTS)) {
  const to = join(OUT, `${part}.png`);
  mkdirSync(dirname(to), { recursive: true });
  await Bun.write(to, await png(shrink(compose(refs))));
}
await Bun.write(STAMP, stamp);
console.log(`立ち絵の部品を ${Object.keys(PARTS).length} 個作りました（${W}x${H}）: ${OUT}`);
