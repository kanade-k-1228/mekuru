# @mekuru/narrator

[English](README.md)

合成音声・立ち絵・字幕を組み合わせて、自分のナレータを作るための共通部品です。立ち絵・まばたき・口パク・字幕と、PSD 素材の準備機能を提供します。

## セットアップ

Bun 1.4 以上が必要です。

```sh
bun add -d @mekuru/types @mekuru/narrator
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/types"` を設定します。音声エンジンと立ち絵の画像素材は別途用意します。

## ナレータを組み立てる

次は `@mekuru/speech`・`@mekuru/audio` を追加したプロジェクトでの例です。先に `face [select]` グループを持つPSDを `mekuru-psd` で展開し、`src` をそのフォルダーに置き換えます。

```tsx
import type { At, FC, Node } from "@mekuru/types";
import { portrait, Subtitle } from "@mekuru/narrator";

import { Audio } from "@mekuru/audio";
import { Voisona } from "@mekuru/speech/voisona";

import type { LayerProps } from "./assets/character/tsuzumi/portrait";

const actor = portrait<LayerProps>({ src: "assets/character/tsuzumi" });
type TsuzumiProps = { text: Node; face?: LayerProps["face"]; id?: string; at?: At };

export const TsuzumiStand = actor.Stand;
export const Tsuzumi: FC<TsuzumiProps> = async ({ text, face, id, at }) => {
  const line = await Voisona.prepare({ voice: "suzuki-tsudumi_ja_JP", text });
  return (
    <dur len={line.audio.len} id={id} at={at}>
      <stack>
        <Audio source={line.audio} />
        <actor.Talk source={line.audio} face={face} />
        <Subtitle color="#E0161E" text={line.display} />
      </stack>
    </dur>
  );
};
```

台本の `<mekuru>` 内に `<Tsuzumi text="こんにちは。" />` と置きます。同じセリフを読み上げ、字幕にも表示します。待機中の立ち絵を表示する場合は、場面の `<stack>` に `<TsuzumiStand />` を置きます。

- 音声生成・キャッシュ・長さは音声コンポーネントが担当します。
- 表情・口パク・待機中の表示は同じパッケージの `portrait()` が担当します。静止画には `<image>` も使えます。
- `prepare` は文字を一度展開して、表示文字と共有する音声素材を返します。`line.audio.len` は音声素材の長さです。外側の `<dur>` でセリフの区間を決めるため、装飾を足しても長さは変わりません。

## 立ち絵・口パク

`portrait<LayerProps>({ src, ...options })` は展開済みの独自PSD素材を読みます。`Stand` は待機表示、`Talk` は共有音声素材の長さと音量に合わせた口パクを行います。PSDには `[fixed]`・`[toggle]`・`[select]`・`[blink]`・`[lip]` を明示し、部位名に依存せず生成されたpropsで表情を選びます。

`blink` でまばたきの平均間隔、`x`・`y`・`w`・`h`・`z`・`rotate`・`anchor`・`slot` で配置を指定できます。[PSD規約・変換手順](../../docs/reference/Portrait.jp.md)を参照してください。

## Subtitle / SubtitleProps

`SubtitleProps` は `IntrinsicElements["text"]` と同じ型です。通常の `<text>` の配置・装飾・時間属性を渡せます。

既定値は `x="50%"`、`y="95%"`、`anchor="b"`、`max-w="90%"`、`align="center"`、`size={54}`、白文字、黒縁7、`z={100}`。propsで上書きできます。

```tsx
<Subtitle y="90%" size={48} stroke="#2E5E8C" text={"Mekuru の字幕です。\n明示した改行を保ちます。"} />
```

`Subtitle` は通常の `<text>` と同じく `text` を受け取り、すべての props をそのまま渡します。文字列は書いたとおりに表示し、`\n` で改行し、空白も除きません。音声と組み合わせる場合は `line.display`、文字を返す部品を含むセリフを表示だけする場合は `@mekuru/speech` の `await subtitleText(text)` を渡します。

二重の縁取りなどは、異なる `stroke` と `stroke-width` の `Subtitle` を同じ位置に重ねて実装できます。

## 立ち絵の準備と変換

```sh
bun x mekuru-psd assets/source/character.psd --out assets/character
# 別の規約で作られた既存PSDを変換する場合:
bun x mekuru-psd source.psd --inspect
bun x mekuru-psd source.psd --map mapping.json --out character.psd
```

`--map` を付けた `mekuru-psd` は、指定されたレイヤーをパーツ・差分ごとに合成し、独自規約のPSDを作ります。元PSDは変更しません。変換後のPSDも通常どおり `--out` で展開し、同じ `portrait()` で使います。設定の書き方は[立ち絵ガイド](../../docs/reference/Portrait.jp.md)を参照してください。
