# @mekuru/style-bert-vits2

[English](README.md)

Mekuru Movie Maker のセリフを、Style-Bert-VITS2 の API サーバーで読み上げる `StyleBertVits2` 部品です。

## セットアップ

[Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) をインストーラーまたは [Python 環境の手順](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/CLI.md)で導入します。初期化前なら `python initialize.py` で必要なファイルと標準モデルを取得します。`model_assets/` 内の各モデルには重み・`config.json`・`style_vectors.npy` が必要です。

エンジンのフォルダで `python server_fastapi.py`（Windows は `Server.bat`）を起動します。接続先は `http://127.0.0.1:5000`。`/models/info` でモデル・話者（`spk2id`）・スタイル（`style2id`）を確認します。例の `jvnv-F1-jp` はインストール済みのモデルに置き換え、モデルの利用規約に従ってください。

Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・日本語フォントを用意し、プロジェクトに追加します。

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/style-bert-vits2
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/types"` を設定します。`bun create @mekuru` では設定済みです。

## 簡単な使い方

`src/main.tsx` に保存します。

```tsx
import { writeXml } from "@mekuru/types";
import { StyleBertVits2 } from "@mekuru/style-bert-vits2";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <StyleBertVits2 model="jvnv-F1-jp">{text}</StyleBertVits2>
      <text x="50%" y="50%" anchor="center" size={60} color="#FFFFFF">{text}</text>
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

`<StyleBertVits2>` に渡すキャラクターごとの設定をエクスポートしています。展開して使い、ほかの props も追加できます。

```tsx
import { StyleBertVits2, amitaro } from "@mekuru/style-bert-vits2";

<StyleBertVits2 {...amitaro}>こんにちは。</StyleBertVits2>;
```

| エクスポート | 名前 | `model` |
| --- | --- | --- |
| `koharuneAmi` | 小春音アミ | `"koharune-ami"` |
| `amitaro` | あみたろ | `"amitaro"` |

## 詳しい使い方

### 声の設定 (`StyleBertVits2Props`)

- `model`: 必須: `model_assets/` 内のモデルのフォルダ名。`/models/info` の数値キーではありません。
- `speaker`: 話者名または数値の ID。省略時は API の既定の話者。ID は `{0}` のように数値で指定し、文字列は名前として扱います。
- `style`: モデルの `style2id` にあるスタイル名。省略時は API の既定のスタイル。
- `style-weight`: 選択したスタイルの強さ。
- `sdp-ratio`: 確率的な発音時間予測の混合比。
- `noise`: 音声合成時のノイズの強さ。
- `noise-w`: 音素の長さに影響するノイズの強さ。
- `length`: 話す長さの倍率。大きいほどゆっくり話します。フレーム数を指定する `len` とは別です。
- `language`: `"JP"`・`"EN"`・`"ZH"`。既定は `"JP"`。モデルが対応している言語を指定します。
- `assist-text`: 声色や表現の参考にするテキスト。
- `assist-text-weight`: 参考テキストの強さ。
- `max-chars`: 1回の合成リクエストの最大文字数。既定は `100`。サーバーの `config.yml` の `server.limit` に合わせます。
- `url`: API のベース URL。既定は `http://127.0.0.1:5000`。

`language`・`max-chars` 以外の省略した合成設定はサーバーの既定値を使います。値は `/docs` で確認できます。長文は句読点の近くで分割して順に合成し、一つの WAV に結合します。`gap` はセリフ全体の後に入ります。HTTP 422 の場合はモデル・言語・スタイル・話者・文字数制限を確認してください。

### テキスト・時間・キャッシュ

`<StyleBertVits2>` は、どの読み上げ部品とも共通の[テキストと時間の属性](../speech/README.jp.md#テキストと時間)を受け取り、同じように[音声をキャッシュ](../speech/README.jp.md#キャッシュとプレビュー)します。`name` の既定は `speaker`（省略時は `model`）です。

### 接続

接続先は `url` → `MEKURU_STYLE_BERT_VITS2_URL` → 既定 URL の順で決まります。Bun と同じ環境から確認します。

```sh
curl http://127.0.0.1:5000/models/info
```

接続できない場合は起動状態とポートを確認します。Windows のエンジンには [WSL の mirrored ネットワーク](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)で `127.0.0.1` から接続できます。

独自のナレータでは `await StyleBertVits2.prepare({ ...声の設定, children })` で音声素材・表示文字・長さをまとめて取得できます。`id`・`at` は配置する部品に付けます。[共有する音声素材](../speech/README.jp.md#共有する音声素材)と[ナレータの組み立て](../narrator/README.jp.md)を参照してください。
