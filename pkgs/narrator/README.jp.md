# @mekuru/narrator

[English](README.md)

合成音声・立ち絵・字幕を組み合わせて、自分のナレータを作るための共通部品です。字幕の表示と、読み上げ用のルビ記法から表示文字への変換を提供します。

## セットアップ

Bun 1.4 以上が必要です。

```sh
bun add -d @mekuru/core @mekuru/narrator
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/core"` を設定します。音声エンジンと立ち絵は別途用意します。

## ナレータを組み立てる

次は `@mekuru/voisona` と `@mekuru/portrait` を追加したプロジェクトでの例です。`src` は自分の立ち絵フォルダに置き換えます。

```tsx
import type { At, Node } from "@mekuru/core";
import { Subtitle } from "@mekuru/narrator";
import { portrait, type Face } from "@mekuru/portrait";
import { Voisona } from "@mekuru/voisona";

const actor = portrait({ src: "assets/character/tsuzumi" });
type TsuzumiProps = { children?: Node; face?: Face; id?: string; at?: At };

export const TsuzumiStand = actor.Stand;
export const Tsuzumi = ({ children, face, id, at }: TsuzumiProps) => (
  <stack id={id} at={at}>
    <actor.Talk face={face}>
      <Voisona voice="suzuki-tsudumi_ja_JP">{children}</Voisona>
    </actor.Talk>
    <Subtitle color="#E0161E">{children}</Subtitle>
  </stack>
);
```

台本の `<mekuru>` 内に `<Tsuzumi>漢字《かんじ》を読みます。</Tsuzumi>` と置きます。音声は「かんじ」、字幕は「漢字」を使います。待機中の立ち絵を表示する場合は、場面の `<stack>` に `<TsuzumiStand />` を置きます。

- 音声生成・キャッシュ・長さは音声コンポーネントが担当します。
- 表情・口パク・待機中の表示は [@mekuru/portrait](../portrait/README.jp.md) が担当します。静止画には `<image>` も使えます。
- 字幕は一セリフをまとめて表示します。`<stack>` は長さのある子のうち、最後に終わるものまで続きます。追加した動画などで長くなる場合は、既存の `<dur>` で制御します。

## Subtitle / SubtitleProps

`SubtitleProps` は `IntrinsicElements["text"]` と同じ型です。通常の `<text>` の配置・装飾・時間属性を渡せます。

既定値は `x="50%"`、`y="95%"`、`anchor="b"`、`max-w="90%"`、`align="center"`、`size={54}`、白文字、黒縁7、`z={100}`。propsで上書きできます。

```tsx
<Subtitle y="90%" size={48} stroke="#2E5E8C">
  ｜Mekuru《めくる》の字幕です。<br />明示した改行を保ちます。
</Subtitle>
```

文字列・数値・配列・フラグメント・`<br />` に対応します。空の値と真偽値は無視し、ほかの要素やコンポーネントはエラーにします。テキストの前後と改行の前後の空白は読み上げと同じように除きます。読み辞書は音声だけに適用されます。幅による折り返しは `<text>` の機能を使い、字幕の時間分割は行いません。

## subtitleText(children): Node

ルビを表示文字に変換し、`<br />` を保持したNodeを返します。独自の字幕に使えます。`@mekuru/speech` が提供する同じ関数の再エクスポートです。

```tsx
import type { Node } from "@mekuru/core";
import { subtitleText } from "@mekuru/narrator";

const MySubtitle = ({ children }: { children?: Node }) => (
  <text x="50%" y="95%" anchor="b" size={48}>
    {subtitleText(children)}
  </text>
);
```

二重の縁取りなどは、異なる `stroke` と `stroke-width` の `Subtitle` を同じ位置に重ねて実装できます。
