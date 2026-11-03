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

次は `@mekuru/voisona`・`@mekuru/speech` を追加したプロジェクトでの例です。`src` は自分の立ち絵フォルダに置き換えます。

```tsx
import type { At, FC, Node } from "@mekuru/types";
import { portrait, Subtitle, type Face } from "@mekuru/narrator";

import { Audio } from "@mekuru/audio";
import { Voisona } from "@mekuru/voisona";

const actor = portrait({ src: "assets/character/tsuzumi" });
type TsuzumiProps = { children?: Node; face?: Face; id?: string; at?: At };

export const TsuzumiStand = actor.Stand;
export const Tsuzumi: FC<TsuzumiProps> = async ({ children, face, id, at }) => {
  const line = await Voisona.prepare({ voice: "suzuki-tsudumi_ja_JP", children });
  return (
    <dur len={line.audio.len} id={id} at={at}>
      <stack>
        <Audio source={line.audio} />
        <actor.Talk source={line.audio} face={face} />
        <Subtitle color="#E0161E">{line.display}</Subtitle>
      </stack>
    </dur>
  );
};
```

台本の `<mekuru>` 内に `<Tsuzumi>漢字《かんじ》を読みます。</Tsuzumi>` と置きます。音声は「かんじ」、字幕は「漢字」を使います。待機中の立ち絵を表示する場合は、場面の `<stack>` に `<TsuzumiStand />` を置きます。

- 音声生成・キャッシュ・長さは音声コンポーネントが担当します。
- 表情・口パク・待機中の表示は同じパッケージの `portrait()` が担当します。静止画には `<image>` も使えます。
- `prepare` は文字を一度展開して、表示文字と共有する音声素材を返します。`line.audio.len` は音声素材の長さです。外側の `<dur>` でセリフの区間を決めるため、装飾を足しても長さは変わりません。

## 立ち絵・口パク

`portrait({ src, ...options })` は YMM4 の「動く立ち絵」形式の画像部品を重ねます。`Stand` は待機表示、`Talk` は共有音声素材の長さに合わせた表示・口パクを担当します。`face`・`faces` で表情、`blink` でまばたき、`x`・`y`・`w`・`h`・`z` で配置を指定できます。

画像フォルダの構成と詳しい使用例は [立ち絵](../../docs/reference/Portrait.jp.md) を参照してください。PSD から準備した素材には、同じパッケージの `psdPortrait()` を使います。

## Subtitle / SubtitleProps

`SubtitleProps` は `IntrinsicElements["text"]` と同じ型です。通常の `<text>` の配置・装飾・時間属性を渡せます。

既定値は `x="50%"`、`y="95%"`、`anchor="b"`、`max-w="90%"`、`align="center"`、`size={54}`、白文字、黒縁7、`z={100}`。propsで上書きできます。

```tsx
<Subtitle y="90%" size={48} stroke="#2E5E8C">
  Mekuru の字幕です。<br />明示した改行を保ちます。
</Subtitle>
```

`Subtitle` は通常の `<text>` と同じように子を展開します。空白や改行を独自に変更せず、`pre` もそのまま渡します。ルビは自動変換しません。音声と組み合わせる場合は `line.display`、表示だけ変換する場合は `await subtitleText(children)` を渡します。

## subtitleText(children): Promise<Node>

ルビを表示文字に変換し、`<br />` を保持したNodeを返します。独自の字幕に使えます。`@mekuru/speech/text` が提供する同じ非同期関数の再エクスポートです。

```tsx
import type { FC, Node } from "@mekuru/types";
import { subtitleText } from "@mekuru/narrator";

const MySubtitle: FC<{ children?: Node }> = async ({ children }) => (
  <text x="50%" y="95%" anchor="b" size={48}>
    {await subtitleText(children)}
  </text>
);
```

二重の縁取りなどは、異なる `stroke` と `stroke-width` の `Subtitle` を同じ位置に重ねて実装できます。

## 旧 API からの移行

- 立ち絵の関数と型は `@mekuru/narrator` から import します。`portrait`・`psdPortrait`・`Face` などの名前は同じです。別の立ち絵パッケージのインストールは不要です。
- `<actor.Talk><Voisona ... /></actor.Talk>` は、`Voisona.prepare(...)` で素材を作り、`<Audio source={line.audio} />` と `<actor.Talk source={line.audio} />` に分けます。既存の WAV は `readAudio` で読み込みます。
- `Subtitle` はルビを自動変換しません。音声と合わせる場合は `line.display`、字幕だけなら `await subtitleText(children)` を渡します。
- `subtitleText` は文字コンポーネントを展開するため非同期です。独自の字幕部品を `async` にして結果を `await` します。
- `<Voisona>` など音声だけを再生する JSX 部品は引き続き使えます。

## Mekuru 互換 PSD のレイヤ命名規約

PSD のグループ名を、そのままキャラの props 名にできます。素材準備時に一度展開します。

```sh
bun x mekuru-psd assets/source/sasara.psd --out assets/sasara
```

```text
キャラ.psd（上が手前）
├─ glass/
│  └─ メガネ
├─ face/
│  ├─ smile
│  └─ angry
└─ body（画像レイヤ）
```

- 最上位のグループに直下の子が2つ以上あれば選択式です。`face?: "smile" | "angry"` のように名前から型を生成します。
- 直下の子が1つなら `glass?: boolean` のようなフラグです。省略・`false` は非表示、`true` は表示します。PSD での表示状態にかかわらず、フラグの初期値は `false` です。
- 最上位の画像レイヤは固定パーツです。props にせず、PSD 保存時の表示状態を維持します。全体を包むグループは作りません。
- 選択式は保存時に表示されていた子が初期値です。グループが非表示、または表示中の子がなければ初期表示なし。複数の子が表示されていればエラーです。
- 子がグループなら内部の表示レイヤをまとめて1つの選択肢にします。より深い階層は props になりません。
- 名前は翻訳・置換しません。props 名には JavaScript の識別子を使えます（日本語も可）。`id`、`at`、`len`、`children`、`source`、`key`、`ref`、`__proto__`、`constructor`、`prototype` は予約名です。
- 空グループ、同じ階層の重複名（大文字・小文字違いも含む）、ファイル名に使えない文字や末尾の空白・ピリオド、Windows の予約ファイル名は使えません。

生成先には `グループ名/選択肢名.png`、`レイヤ名.png`、描画順・初期値などを記録した `portrait.json`、props 型の `portrait.d.ts` ができます。画像は元キャンバスの寸法・座標を維持します。再実行時は生成対象を更新し、以前のメタデータに記録された不要な画像だけを削除します。生成先はこの素材専用のディレクトリにしてください。

```tsx
import type { FC } from "@mekuru/types";
import { psdPortrait } from "@mekuru/narrator";

import { Audio } from "@mekuru/audio";
import { readAudio } from "@mekuru/audio";
import type { LayerProps } from "./assets/sasara/portrait";

const Sasara = psdPortrait<LayerProps>({ src: "assets/sasara" });

<Sasara.Stand face="smile" glass />;
const Line: FC = async () => {
  const source = await readAudio("assets/voice/line.wav");
  return <stack><Audio source={source} /><Sasara.Talk source={source} face="angry" /></stack>;
};
```

パスは台本の位置に合わせて調整してください。`Stand` は `id`・`at`・`len`、`Talk` は `source` に音声素材を受け取り、表示だけを生成します。各呼び出しは初期値から解決し、前のセリフの指定を引き継ぎません。配置は `psdPortrait` の `x`・`y`・`w`・`h`・`z`・`rotate`・`anchor`・`slot` で指定できます。字幕は既存の `Subtitle` と組み合わせます。

初版は8-bit RGB、通常合成のラスターレイヤ、不透明度、ラスターマスクに対応します。通常合成のグループと、不透明度100%・マスクなしの通過グループを使用できます。調整レイヤ、クリッピング、レイヤー効果、ベクターマスク等はエラーになります。該当する絵を選択肢の内側でラスタライズ・統合してから書き出してください。自動の瞬き・口パクは行いません。既存の YMM4 形式の `portrait()` は引き続き利用できます。

入れ子のグループも同名のディレクトリに展開し、非表示の内部レイヤも保存します。選択肢となる子グループは描画用の合成 PNG も生成します（例：`face/smile.png` と `face/smile/線画.png`）。内部レイヤの PNG はそのレイヤ自身のマスク・不透明度を反映し、親グループの効果は合成 PNG に反映します。

`Audio` と `readAudio` は `@mekuru/audio`、`joinWavs` は `@mekuru/audio/wav` が提供します。

## 字幕の配分とSRT

`@mekuru/narrator/captions` の `captionCues(texts, frames, options?)` は
`{ text, offset, frames }[]` を返します。各字幕に1フレームを確保し、残りを
空白・改行を除くUnicodeコードポイント数で配分します。総尺不足はエラーです。
独自の `weights`、または先頭0・末尾framesの全 `boundaries` を指定できます。
余韻は配分後に最後のキューのframesへ加え、既存のseq・durで描画します。

`toSrt(cues, fps)` には `{ text, startFrame, endFrame }[]` と有理数fpsを渡します。
時刻はコンパイラで確定した絶対フレームを使い、ミリ秒への丸めは出力時に行います。
スタイル・字幕ID・台本の分割規則は動画側に残ります。
[描画とSRTで同じ字幕を使う例](README.md#caption-intervals-and-srt)を参照してください。
