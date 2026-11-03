# 立ち絵

[English](Portrait.jp.md)

`@mekuru/narrator` は YMM4 の「動く立ち絵」形式の画像を重ね、まばたき・表情の切り替え・音量に合わせた口パクを行います。

```sh
bun add -d @mekuru/narrator
```

## 部品のフォルダ

プロジェクト内に、同じ寸法の画像部品を配置します。PNG・JPEG・WebP に対応し、重ねる部分には透過画像を使います。PSD は部品ごとにレイヤーを合成して PNG に書き出してください。

```text
assets/character/pikao-tsuzumi/
  体/    基本.png  説明.png
  目/    基本.png  基本.0.png  基本.1.png  笑顔.png
  口/    基本.png  基本.0.png  基本.1.png  にこ.png
  眉/    基本.png
  顔色/  基本.png
  他/    音符.png
```

- 描画順は奥から `後 → 体 → 顔色 → 髪 → 口 → 目 → 眉 → 他`。
- 目と口は `名前.0.png` が閉じた状態。番号順に開き、`名前.png` が全開。`.0` がなければ静止し、`名前.png` がなければ部品として使いません。
- `髪/名前.ini` の `opacity=0.5` は、その髪を眉の上に半透明で再描画します。
- `名前.a.png` など、連番以外で `.` を含むファイル名は対象外です。

## 使い方

`src/parts.tsx` などで部品を定義し、台本の `<mekuru>` 内に `<Scene />` を置きます。以下は [example の素材の準備スクリプト](../../example/scripts/portrait.ts)で取り込んだ部品を使う例です。

```tsx
import type { FC } from "@mekuru/types";
import { portrait } from "@mekuru/narrator";

import { Audio } from "@mekuru/audio";
import { Voisona } from "@mekuru/voisona";

const actor = portrait({
  src: "assets/character/pikao-tsuzumi",
  face: { 体: "基本", 髪: null, 目: "基本", 口: "基本", 眉: "基本", 顔色: "基本" },
  faces: { 笑顔: { 目: "笑顔", 口: "にこ" } },
});

export const Scene: FC = async () => {
  const line = await Voisona.prepare({ voice: "suzuki-tsudumi_ja_JP", children: "こんにちは。" });
  return <stack>
    <actor.Stand />
    <Audio source={line.audio} />
    <actor.Talk source={line.audio} face="笑顔" />
  </stack>;
};
```

`Stand` は親の終わりまで表示します。`Talk` は共有する音声素材を `source` に受け取り、その長さだけ立ち絵を表示します。音声は `Audio` で別に再生します。同じ `slot` の `Stand` は発言中だけ差し替わります。口は WAV の音量に合わせて動き、下書きでは閉じたままです。既存の WAV は `@mekuru/audio` の `readAudio(src)` で素材にできます。これらの非同期処理は `<mekuru>` 内の部品で行います。

## オプション

- `src`: 部品フォルダ。プロジェクトからの相対パス
- `x`・`y`・`anchor`・`w`・`h`・`z`: `<image>` と同じ。既定: 画面下中央、高さ80%
- `face`: 基本の部品構成。未指定なら `体`・`髪`・`目`・`口`・`眉` の名前順で最初の部品（目・口は動くものを優先）。`顔色`・`他`・`後` はなし
- `faces`: 名前付き表情。基本の構成との差分
- `blink`: まばたきの平均間隔（フレーム）。既定: 4秒分。`false` で停止
- `slot`: 差し替えの識別名。既定: `portrait:<src>`。同じ素材を別の位置にも置く場合は分ける

`Stand`・`Talk` の `face` に表情名または部品構成を指定します。`null` は非表示。`他`・`後` は配列で3部品まで指定でき、先のものほど手前になります。存在しない名前はエラーです。`Stand` は `id`・`at`・`len` も受け取ります。

## YMM4 との違い

口パクは音量で決まり、母音別の画像は使いません。GIF・動画の部品と、`顔色` の `.ini` による合成モードには対応していません。
