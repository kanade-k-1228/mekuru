# @mekuru/coeiroink

[English](README.md)

Mekuru Movie Maker のセリフを、COEIROINK v2 で読み上げる `Coeiroink` 部品です。

## セットアップ

[COEIROINK v2](https://coeiroink.com/download) をインストールし、「キャラクターダウンロード」で声を追加して再起動します。接続先は `http://127.0.0.1:50032`。名前・UUID・スタイルは `/v1/speakers` で確認できます。`COEIROINK:つくよみちゃん` などのクレジットを記載し、声の利用規約に従ってください。

Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・日本語フォントを用意し、プロジェクトに追加します。

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/coeiroink
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/types"` を設定します。`bun create @mekuru` では設定済みです。

## 簡単な使い方

`src/main.tsx` に保存します。

```tsx
import { writeXml } from "@mekuru/types";
import { Coeiroink } from "@mekuru/coeiroink";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Coeiroink speaker="つくよみちゃん/れいせい" text={text} />
      <text x="50%" y="50%" anchor="center" size={60} color="#FFFFFF" text={text} />
    </stack>
  </mekuru>,
);
```

```sh
bun src/main.tsx
bunx mekuru-compiler .mekuru/main.xml --serve
```

`http://localhost:3333` でプレビューします。書き出しは `bunx mekuru-compiler .mekuru/main.xml -o video.mp4`。

## キャラクター

`<Coeiroink>` に渡すキャラクターごとの設定をエクスポートしています。展開して使い、ほかの props も追加できます。

```tsx
import { Coeiroink, tsukuyomi } from "@mekuru/coeiroink";

<Coeiroink {...tsukuyomi} text="こんにちは。" />;
```

| エクスポート | 名前 | `speaker` |
| --- | --- | --- |
| `tsukuyomi` | つくよみちゃん | `"つくよみちゃん"` |
| `mana` | MANA | `"MANA"` |
| `kana` | KANA | `"KANA"` |
| `ofutonp` | おふとんP | `"おふとんP"` |
| `ayaka` | AI声優-朱花 | `"AI声優-朱花"` |
| `aoba` | AI声優-青葉 | `"AI声優-青葉"` |
| `ginga` | AI声優-銀芽 | `"AI声優-銀芽"` |
| `kanae` | AI声優-金苗 | `"AI声優-金苗"` |
| `dia` | ディアちゃん | `"ディアちゃん"` |
| `arma` | アルマちゃん | `"アルマちゃん"` |
| `lilin` | リリンちゃん | `"リリンちゃん"` |
| `croix` | クロワちゃん | `"クロワちゃん"` |
| `andzie` | アンジーさん | `"アンジーさん"` |
| `ameno` | アメノちゃん | `"アメノちゃん"` |

## 詳しい使い方

### 声の設定 (`CoeiroinkProps`)

- `speaker`: 必須: 話者名、`"話者名/スタイル名"`、speakerUuid（`/スタイル名` も指定可）、または数値のスタイル ID。名前・UUID だけなら最初のスタイルを選びます。
- `speed`: 話す速さの倍率。既定は `1`。
- `pitch`: COEIROINK の単位での声の高さの調整。既定は `0`。
- `intonation`: 抑揚の強さ。既定は `1`。
- `volume`: 合成時の音量の倍率。既定は `1`。
- `pre`・`post`: 読み上げの前後の無音（秒）。既定はそれぞれ `0.1`。
- `pause`: 「、」などの句読点の無音（秒）。既定では省略し、エンジンに任せます。
- `max-chars`: 1回の合成リクエストの最大文字数。長いセリフは句読点の近くで分割し、一つの WAV に結合します。既定は制限なし。
- `url`: エンジンのベース URL。既定は `http://127.0.0.1:50032`。

話者が見つからない場合は、エラーに利用可能な話者・スタイル名を表示します。`/v1/speakers` とダウンロード状態を確認し、アプリを再起動してください。

### テキスト・時間・キャッシュ

`<Coeiroink>` は、どの読み上げ部品とも共通の[テキストと時間の属性](../speech/README.jp.md#テキストと時間)を受け取り、同じように[音声をキャッシュ](../speech/README.jp.md#キャッシュとプレビュー)します。`name` の既定は `speaker` です。

### 接続

接続先は `url` → `MEKURU_COEIROINK_URL` → 既定 URL の順で決まります。Bun と同じ環境から確認します。

```sh
curl http://127.0.0.1:50032/v1/speakers
```

接続できない場合は起動状態とポートを確認します。Windows のエンジンには [WSL の mirrored ネットワーク](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)で `127.0.0.1` から接続できます。

独自のナレータでは `await Coeiroink.prepare({ ...声の設定, text })` で音声素材・表示文字・長さをまとめて取得できます。`id`・`at` は配置する部品に付けます。[共有する音声素材](../speech/README.jp.md#共有する音声素材)と[ナレータの組み立て](../narrator/README.jp.md)を参照してください。
