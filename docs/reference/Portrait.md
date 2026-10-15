# 立ち絵

- `@mekuru/portrait` の `portrait()` で、部品を重ねた立ち絵を作る
- 部品のフォルダは [YMM4](https://manjubox.net/ymm4/) の「動く立ち絵」と同じ形。YMM4 用の素材をそのまま使える
- まばたきし、セリフの間は表情を変えて、声の大きさに合わせて口を動かす

```
$ bun add -d @mekuru/portrait
```

## 部品のフォルダ

```
example/assets/character/sasara/
  体/    基本.png  指差し.png  考え.png  腕組み.png …
  目/    基本.png  基本.0.png  基本.1.png  笑い.png  ウインク.png  驚き.png  ジト目.png …
  口/    基本.png  基本.0.png  基本.1.png  笑い.png  笑い.0.png  笑い.1.png  お.png  お.0.png  お.1.png …
  眉/    基本.png  上がり.png  困り.png  怒り.png …
  顔色/  ほんのり.png  照れ.png  真っ赤.png
  他/    ハート.png  ビックリ.png  はてな.png  汗.png  キラキラ.png …
```

- example の解説役の立ち絵の部品。[ささらちゃん立ち絵素材](https://seiga.nicovideo.jp/seiga/im10852558)（しりんだーふれいる 様）の PSD から `example/scripts/portrait.ts` で作る（髪は体と一枚なので `髪` はない）
- PSD（PSDToolKit 用など）の素材は、部品ごとにレイヤーを重ねた透過 PNG にすれば使える
- ポーズは `体` の部品を替える（`指差し` は指を差す腕の体）
- 画像（PNG・JPEG・WebP）は、すべて同じ大きさの透過画像
- 奥から `後`・`体`・`顔色`・`髪`・`口`・`目`・`眉`・`他` の順に重ねる
- `目`・`口` の動き
  - `名前.0.png` が閉じた状態。番号が大きいほど開き、`名前.png` がいちばん開いた状態
  - `.0` がない部品は動かない
  - `名前.png` がない `名前.0.png` などは使わない
- `髪/名前.ini` に `opacity=0.5`: その髪を眉の上に半透明でもう一度描く
- ほかに `.` を含む名前（`名前.a.png` など）は部品にならない

## 使い方

```tsx
// example/src/parts.tsx（抜粋）
const SRC = "assets/character/sasara";
const BASE: Face = { 体: "基本", 目: "基本", 口: "基本", 眉: "基本", 顔色: "ほんのり" };
const FACES = {
  笑顔: { 目: "笑い", 口: "笑い" },
  ウインク: { 目: "ウインク", 口: "笑い", 他: "ハート" },
  指差し: { 体: "指差し" },
  決め: { 体: "指差し", 目: "ウインク", 口: "笑い", 他: "ハート" },
  …
} satisfies Record<string, Face>;
…
const sasara = portrait({ src: SRC, x: "84%", y: "116%", h: "132%", z: 10, face: BASE, faces: FACES });
const big = portrait({ src: SRC, x: "81%", y: "138%", h: "165%", z: 30, slot: "portrait:big", face: BASE, faces: FACES });
export const SasaraStand = sasara.Stand;
…
export const Sasara = ({ children, face, show, ...time }: Line) => (
  <stack {...time}>
    <sasara.Talk face={face}>
      <Voicevox {...voice}>{children}</Voicevox>
    </sasara.Talk>
    <Subtitle>{children}</Subtitle>
    {show}
  </stack>
);
```

```tsx
// example/src/main.tsx（抜粋）
<mekuru size="1920x1080" fps={30} font="Rounded Mplus 1c">
  …
  <stack>
    <SasaraStand />
    <seq>
      …
      <Sasara face="決め">ささらちゃんだよー！</Sasara>
```

- `<sasara.Stand face?>`: 置いた入れ物が終わるまで立っている立ち絵
- `<sasara.Talk face?>`: 中の読み上げの部品（`<audio>` でもよい）の音声と、話す立ち絵
  - セリフの間は `Stand` と差し替わる
  - 口は合成した音声の大きさで動く（下書きでは閉じたまま）
- 無い表情・部品の名前はエラーになる（ある名前を表示する）

## オプション

- `src`: 部品のフォルダ（プロジェクトのフォルダから）
- `x`・`y`・`anchor`・`w`・`h`・`z`: `<image>` と同じ（既定は画面の下の中央、高さ 80%）
- `face`: いつもの顔（フォルダごとの部品の名前）。既定は `体`・`髪`・`目`・`口`・`眉` ごとに名前順で最初の部品（`目`・`口` は動くものを優先。`顔色`・`他`・`後` はなし）
- `faces`: 表情ごとの、いつもの顔との違い
  - `他`・`後` は 3 つまで（`他: ["汗", "怒り"]`。先に書いたものが手前）
  - `null` で表示しない
- `blink`: まばたきの平均間隔（フレーム。既定は 4 秒ぶん）。`false` でしない
- `slot`: 差し替えに使う `slot` の名前（既定 `portrait:<src>`）
  - 同じ部品で、置き方の違う立ち絵をもう一つ作るときは分ける（example のジングルとエンドカードで使う、大きな立ち絵 `big`）

## YMM4 との違い

- 口パクは声の大きさで決める。母音ごとの口（`名前.a.png` など）は使わない
- GIF・動画の部品、`顔色` の合成モード（`.ini` の `blend`）には対応していない
