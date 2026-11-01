# @mekuru/style-bert-vits2

[English](README.md)

Mekuru Movie Maker のセリフを、Style-Bert-VITS2 の API サーバーで読み上げる `StyleBertVits2` 部品です。

## セットアップ

[Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) をインストーラーまたは [Python 環境の手順](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/CLI.md)で導入します。初期化前なら `python initialize.py` で必要なファイルと標準モデルを取得します。`model_assets/` 内の各モデルには重み・`config.json`・`style_vectors.npy` が必要です。

エンジンのフォルダで `python server_fastapi.py`（Windows は `Server.bat`）を起動します。接続先は `http://127.0.0.1:5000`。`/models/info` でモデル・話者（`spk2id`）・スタイル（`style2id`）を確認します。例の `jvnv-F1-jp` はインストール済みのモデルに置き換え、モデルの利用規約に従ってください。

Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・日本語フォントを用意し、プロジェクトに追加します。

```sh
bun add -d @mekuru/core @mekuru/cli @mekuru/style-bert-vits2
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/core"` を設定します。`bun create @mekuru` では設定済みです。

## 簡単な使い方

`src/main.tsx` に保存します。

```tsx
import { writeXml } from "@mekuru/core";
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
bunx mekuru-server .mekuru/main.xml
```

`http://localhost:3333` でプレビューします。書き出しは `bunx mekuru-compiler .mekuru/main.xml -o video.mp4`。

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

### テキストと時間

- `children`: セリフ。文字列・数値・フラグメント・`<br />`。空の読み上げはエラー。
- `name`: タイムラインの話者名。既定: `speaker` / `model`（`speaker` 省略時は `model`）。
- `reading`: 読みの辞書。例: `{ Mekuru: "めくる" }`。長いキーを優先し、表示は変えない。
- `gap`: セリフの後の無音（フレーム）。既定: `Math.round(0.3 * fps)`（30 fps で9）。
- `gain-db`: 再生音量の調整（dB）。既定: 調整なし。
- `len`: 無音を含む全体のフレーム数。既定: 音声の長さを切り上げた値 + `gap`。話速は変えない。
- `id`・`at`: 生成する `<dur>` の識別名と開始時刻。[時間の属性](../../docs/reference/Syntax.jp.md#時間の属性)を参照。

ルビ `｜表示《よみ》` は「よみ」を読み、タイムラインには「表示」を残します。半角 `|` と `漢字《かんじ》` も使用できます。`<br />` は空白になり、ほかの要素は入れられません。セリフの連続再生は `<seq>`、字幕との同時表示は `<stack>`、口パクは[立ち絵の `Talk`](../portrait/README.jp.md) を使います。

### キャッシュとプレビュー

- 音声はエンジン・声の設定・読み上げテキストをキーに `.mekuru/cache/tts/` へ保存。キャッシュ済みならエンジン停止中も使用できます。
- 接続先や再生設定の変更では再合成しません。同名のモデルを更新した場合などは、該当する WAV を削除して再生成します。
- `writeXml()` は合成中に無音の下書きを出し、完了後に XML を更新します。動画の書き出し前に `await` してください。

### 接続

接続先は `url` → `MEKURU_STYLE_BERT_VITS2_URL` → 既定 URL の順で決まります。Bun と同じ環境から確認します。

```sh
curl http://127.0.0.1:5000/models/info
```

接続できない場合は起動状態とポートを確認します。Windows のエンジンには [WSL の mirrored ネットワーク](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)で `127.0.0.1` から接続できます。
