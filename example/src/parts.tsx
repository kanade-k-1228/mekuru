import type { At, Length, Node } from "@mekuru/core";
import { portrait, type Face } from "@mekuru/portrait";
import { Voicevox } from "@mekuru/voicevox";

type Children = { children?: Node };

export const COLOR = {
  ink: "#2B2B2B",
  sub: "#6F6F6F",
  red: "#E0161E",
  orange: "#F28A1E",
  blue: "#2F80ED",
  green: "#2BA84A",
  pink: "#F8B8D0",
  magenta: "#E01890",
};
const MONO = "DejaVu Sans Mono";

const READING: Record<string, string> = {
  Mekuru: "めくる",
  mekuru: "めくる",
  "mekuru-app": "めくるアップ",
  "my-video": "マイビデオ",
  "video.mp4": "ビデオ エムピーフォー",
  "youtube.yaml": "ユーチューブ ヤムル",
  "Upload.md": "アップロード エムディー",
  "main.tsx": "メイン ティーエスエックス",
  "parts.tsx": "パーツ ティーエスエックス",
  README: "リードミー",
  TSX: "ティーエスエックス",
  Bun: "バン",
  bun: "バン",
  ffmpeg: "エフエフエムペグ",
  WSL: "ダブリューエスエル",
  VOICEVOX: "ボイスボックス",
  Voicevox: "ボイスボックス",
  YouTube: "ユーチューブ",
  OK: "オーケー",
  import: "インポート",
  install: "インストール",
  preview: "プレビュー",
  build: "ビルド",
  "dry-run": "ドライラン",
  configs: "コンフィグズ",
  docs: "ドックス",
  example: "イグザンプル",
  src: "ソース",
  character: "キャラクター",
  rect: "レクト",
  text: "テキスト",
  stack: "スタック",
  seq: "シーク",
  column: "カラム",
  speed: "スピード",
  READING: "リーディング",
  x: "エックス",
  h: "エイチ",
};

const LINE = 25;
const ems = (t: string) => [...t].reduce((w, c) => w + (c.charCodeAt(0) < 0x80 ? 0.55 : 1), 0);
const balance = (text: Node): Node => {
  if (typeof text !== "string" || ems(text) <= LINE) return text;
  let [at, best] = [-1, Infinity];
  for (let i = 0; i < text.length - 1; i++) {
    if (!"、。！？".includes(text[i])) continue;
    const longer = Math.max(ems(text.slice(0, i + 1)), ems(text.slice(i + 1).trim()));
    if (longer < best) [at, best] = [i, longer];
  }
  if (best > LINE) return text;
  return (
    <>
      {text.slice(0, at + 1)}
      <br />
      {text.slice(at + 1).trim()}
    </>
  );
};

const Subtitle = ({ children }: Children) => (
  <>
    {(
      [
        ["#B80D14", 9],
        ["#FFFFFF", 6],
      ] as const
    ).map(([stroke, width]) => (
      <text x="50%" y="97%" anchor="b" max-w="74%" align="center" size={56} weight="bold" color={COLOR.red} stroke={stroke} stroke-width={width} z={100}>
        {balance(children)}
      </text>
    ))}
  </>
);

const SRC = "assets/character/sasara";
const BASE: Face = { 体: "基本", 目: "基本", 口: "基本", 眉: "基本", 顔色: "ほんのり" };
const FACES = {
  笑顔: { 目: "笑い", 口: "笑い" },
  ウインク: { 目: "ウインク", 口: "笑い", 他: "ハート" },
  指差し: { 体: "指差し" },
  決め: { 体: "指差し", 目: "ウインク", 口: "笑い", 他: "ハート" },
  驚き: { 目: "驚き", 眉: "上がり", 口: "お", 他: "ビックリ" },
  困り: { 眉: "困り", 口: "困り", 他: "汗" },
  はてな: { 体: "考え", 眉: "困り", 口: "お", 他: "はてな" },
  ドヤ: { 体: "腕組み", 目: "ジト目", 眉: "上がり", 口: "笑い", 他: "キラキラ" },
  照れ: { 目: "笑い", 口: "笑い", 顔色: "照れ" },
} satisfies Record<string, Face>;
export type FaceName = keyof typeof FACES;

const sasara = portrait({ src: SRC, x: "84%", y: "116%", h: "132%", z: 10, face: BASE, faces: FACES });
const big = portrait({ src: SRC, x: "81%", y: "138%", h: "165%", z: 30, slot: "portrait:big", face: BASE, faces: FACES });
export const SasaraStand = sasara.Stand;

const voice = { name: "sasara", speaker: "冥鳴ひまり", speed: 1.15, intonation: 1.25, gap: 6, reading: READING };

type Line = Children & { id?: string; at?: At; face?: FaceName; show?: Node };

export const Sasara = ({ children, face, show, ...time }: Line) => (
  <stack {...time}>
    <sasara.Talk face={face}>
      <Voicevox {...voice}>{children}</Voicevox>
    </sasara.Talk>
    <Subtitle>{children}</Subtitle>
    {show}
  </stack>
);

export const Jingle = ({ children }: { children: string }) => (
  <stack>
    <rect w="100%" h="100%" fill={COLOR.pink} z={20} />
    <text x="30%" y="47%" anchor="c" size={180} weight="bold" color="#FFFFFF" stroke={COLOR.magenta} stroke-width={18} rotate={-9} z={21}>
      {children}
    </text>
    <audio src="assets/chime.wav" volume={0.5} />
    <big.Stand face="決め" />
    <seq>
      <dur len={9} />
      <big.Talk face="決め">
        <Voicevox {...voice}>{children}</Voicevox>
      </big.Talk>
      <dur len={21} />
    </seq>
  </stack>
);

export const Exit = () => (
  <dur len={36}>
    <rect x={1150} w={770} h="100%" fill="#FFFFFF" fadein={24} z={15} />
  </dur>
);

export const EndCard = ({ top, bottom, credit, len }: { top: string; bottom: string; credit: string; len: number }) => {
  const [cx, cy, n] = [620, 560, 36];
  const rays = Array.from({ length: n }, (_, i) => {
    const at = (k: number) => {
      const a = ((i + k) / n) * 2 * Math.PI;
      return `${Math.round(cx + 2400 * Math.cos(a))}:${Math.round(cy + 2400 * Math.sin(a))}`;
    };
    return <line p={`${cx}:${cy},${at(0)},${at(0.45)}`} closed fill="#FBD3E1" z={21} />;
  });
  return (
    <dur len={len}>
      <rect w="100%" h="100%" fill="#FFF3F7" z={20} />
      {rays}
      <text x={60} y={70} size={210} weight="bold" color={COLOR.red} stroke="#FFFFFF" stroke-width={16} rotate={-5} z={40}>
        {top}
      </text>
      <text x={60} y={700} size={150} weight="bold" color={COLOR.red} stroke="#FFFFFF" stroke-width={14} rotate={-5} z={40}>
        {bottom}
      </text>
      <text x={70} y="97%" anchor="bl" size={34} weight="bold" color={COLOR.sub} stroke="#FFFFFF" stroke-width={6} z={40}>
        {credit}
      </text>
      <big.Stand face="決め" />
    </dur>
  );
};

export const Step = ({ n, children }: { n?: string } & Children) => (
  <row x={60} y={36} gap={22} align="center">
    {n && (
      <text size={72} weight="bold" color={COLOR.orange} stroke="#FFFFFF" stroke-width={8}>
        {n}
      </text>
    )}
    <text size={54} weight="bold" color={COLOR.ink} stroke="#FFFFFF" stroke-width={8}>
      {children}
    </text>
  </row>
);

export const Keyword = ({ x, y, size = 140, anchor, children }: { x: Length; y: Length; size?: number; anchor?: "tl" | "c" | "t" } & Children) => (
  <text x={x} y={y} anchor={anchor} size={size} weight="bold" color="#1A1A1A" stroke="#FFFFFF" stroke-width={12}>
    {children}
  </text>
);

export const Label = ({
  x,
  y,
  anchor = "c",
  size = 56,
  color = COLOR.orange,
  at,
  children,
}: { x: Length; y: Length; anchor?: "tl" | "c" | "b" | "l"; size?: number; color?: string; at?: At } & Children) => (
  <text x={x} y={y} anchor={anchor} size={size} weight="bold" color={color} stroke="#FFFFFF" stroke-width={9} at={at} fadein={5} z={50}>
    {children}
  </text>
);

export const Mark = ({ x, y, w, h, at }: { x: Length; y: Length; w: Length; h: Length; at?: At }) => (
  <rect x={x} y={y} w={w} h={h} stroke={COLOR.red} stroke-width={7} radius={10} at={at} fadein={5} z={50} />
);

export const Arrow = ({ x1, y1, x2, y2, at }: { x1: number; y1: number; x2: number; y2: number; at?: At }) => (
  <line p={`${x1}:${y1},${x2}:${y2}`} head="end" stroke={COLOR.orange} stroke-width={14} at={at} fadein={5} z={50} />
);

export const Point = ({ children, size = 46 }: Children & { size?: number }) => (
  <row gap={22} align="center">
    <circle w={24} h={24} fill={COLOR.red} />
    <text size={size} weight="bold" color={COLOR.ink}>
      {children}
    </text>
  </row>
);

export const Note = ({ children, size = 36 }: Children & { size?: number }) => (
  <text size={size} color={COLOR.sub}>
    {children}
  </text>
);

export interface CodeAt {
  x: number;
  y: number;
  size: number;
}
const LH = 1.45;
const PAD: [number, number] = [18, 24];

export const Code = ({ at: { x, y, size }, w, children }: { at: CodeAt; w?: number; children: string }) => (
  <column x={x} y={y} w={w} fill="#FAFAFA" stroke="#C8C8C8" stroke-width={3} radius={8} padding={PAD}>
    <row gap={24}>
      <text pre font={MONO} size={size} line-height={LH} color="#A8A8A8" align="right">
        {children
          .split("\n")
          .map((_, i) => String(i + 1))
          .join("\n")}
      </text>
      <text pre font={MONO} size={size} line-height={LH} color={COLOR.ink}>
        {children}
      </text>
    </row>
  </column>
);

export const CodeMark = ({ code: { x, y, size }, from, to = from, w, at }: { code: CodeAt; from: number; to?: number; w: number; at?: At }) => {
  const lh = size * LH;
  return <Mark x={x + 8} y={y + PAD[0] + (from - 1) * lh - 4} w={w} h={(to - from + 1) * lh + 8} at={at} />;
};

const TERM_BAR = 46;
const TERM_LH = 1.75;

export const Terminal = ({ at: { x, y, size }, w, children }: { at: CodeAt; w?: Length; children: string }) => {
  let command = false;
  return (
    <column x={x} y={y} w={w} fill="#1F2229" radius={12} padding={[0, 0, 22, 0]}>
      <row h={TERM_BAR} padding={[0, 20]} gap={12} align="center">
        <circle w={16} h={16} fill="#FF5F57" />
        <circle w={16} h={16} fill="#FEBC2E" />
        <circle w={16} h={16} fill="#28C840" />
      </row>
      <column padding={[4, 30]} gap={size * (TERM_LH - 1.4)}>
        {children.split("\n").map((line) => {
          const prompt = line.startsWith("$ ");
          command = prompt || (command && line.startsWith(" "));
          const indent = line.length - line.trimStart().length;
          const body = (
            <text pre font={MONO} size={size} color={command ? "#F2F2F2" : "#A9B1BC"} padding={[0, 0, 0, prompt ? 0 : indent * size * 0.6]}>
              {(prompt ? line.slice(2) : line.trim()) || " "}
            </text>
          );
          command &&= line.endsWith("\\");
          if (!prompt) return body;
          return (
            <row gap={size * 0.6}>
              <text font={MONO} size={size} color="#5FD068">
                $
              </text>
              {body}
            </row>
          );
        })}
      </column>
    </column>
  );
};

export const TermMark = ({ term: { x, y, size }, from, to = from, w, at }: { term: CodeAt; from: number; to?: number; w: number; at?: At }) => {
  const lh = size * TERM_LH;
  return <Mark x={x + 10} y={y + TERM_BAR + 4 + (from - 1) * lh - 8} w={w} h={(to - from) * lh + size * 1.4 + 16} at={at} />;
};

const ROW = 56;
export type Entry = readonly [depth: number, name: string, note?: string];

export const Tree = ({ at: { x, y, size }, w, entries }: { at: CodeAt; w: number; entries: readonly Entry[] }) => (
  <column x={x} y={y} w={w} fill="#F4F4F6" stroke="#D3D3D8" stroke-width={3} radius={8} padding={[16, 24]}>
    {entries.map(([depth, name, note]) => (
      <row h={ROW} gap={16} align="center" padding={[0, 0, 0, depth * 38]}>
        {name.endsWith("/") ? (
          <rect w={34} h={26} radius={4} fill="#F2B84B" />
        ) : (
          <rect w={26} h={32} radius={3} fill="#FFFFFF" stroke="#9AA0A8" stroke-width={3} />
        )}
        <text font={MONO} size={size} color={COLOR.ink} w={340 - depth * 38}>
          {name}
        </text>
        {note && (
          <text size={size - 2} color={COLOR.sub}>
            {note}
          </text>
        )}
      </row>
    ))}
  </column>
);

export const TreeMark = ({ tree: { x, y }, from, to = from, w, at }: { tree: CodeAt; from: number; to?: number; w: number; at?: At }) => (
  <Mark x={x + 8} y={y + 16 + (from - 1) * ROW} w={w} h={(to - from + 1) * ROW} at={at} />
);

export const Shot = ({ x, y, src, w, h }: { x: Length; y: Length; src: string; w?: Length; h?: Length }) => (
  <column x={x} y={y} stroke="#BDBDBD" stroke-width={3} radius={4}>
    <image src={src} w={w} h={h} />
  </column>
);
