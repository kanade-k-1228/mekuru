# @mekuru/voisona

[English](README.md)

Mekuru Movie Maker のセリフを、VoiSona Talk の REST API で読み上げる `Voisona` 部品です。

## セットアップ

Windows・macOS で VoiSona Talk 1.3.7 以降にサインインし、ボイスライブラリを取得します。環境設定の「API」タブで API パスワードを設定し、「REST APIを有効にする」をオンにします（ポート `32766`）。アプリは起動したまま使います。[公式の設定手順](https://manual.voisona.com/ja/talk/pc/2b6e9bc7efb180ea86ccc6c7347e9ca6)。

Bun を動かすシェルで、サインインのメールアドレスと「API」タブのパスワードを設定します。

```sh
export MEKURU_VOISONA_USER='you@example.com'
export MEKURU_VOISONA_PASSWORD='your-api-password'
```

例では `tanaka-san_ja_JP`（田中傘）を使います。取得済みのライブラリを指定し、その利用規約に従ってください。

Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・日本語フォントを用意し、プロジェクトに追加します。

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/voisona
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/types"` を設定します。`bun create @mekuru` では設定済みです。

## 簡単な使い方

`src/main.tsx` に保存します。

```tsx
import { writeXml } from "@mekuru/types";
import { Voisona } from "@mekuru/voisona";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Voisona voice="tanaka-san_ja_JP" text={text} />
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

`<Voisona>` に渡すキャラクターごとの設定をエクスポートしています。展開して使い、ほかの props も追加できます。

```tsx
import { Voisona, tanaka } from "@mekuru/voisona";

<Voisona {...tanaka} text="こんにちは。" />;
```

| エクスポート | 名前 | `voice` |
| --- | --- | --- |
| `tanaka` | 田中傘 | `"tanaka-san_ja_JP"` |
| `chisa` | 知声 | `"chis-a_ja_JP"` |
| `sasara` | さとうささら | `"sato-sasara_ja_JP"` |
| `tsuzumi` | すずきつづみ | `"suzuki-tsudumi_ja_JP"` |
| `takahashi` | タカハシ | `"takahashi_ja_JP"` |
| `rikka` | 小春六花 | `"koharu-rikka_ja_JP"` |
| `karin` | 夏色花梨 | `"natsuki-karin_ja_JP"` |
| `chifuyu` | 花隈千冬 | `"hanakuma-chifuyu_ja_JP"` |
| `minato` | 双葉湊音 | `"futaba-minato_ja_JP"` |

## 詳しい使い方

### 声の設定 (`VoisonaProps`)

- `voice`: 必須: `"tanaka-san_ja_JP"` などのボイスライブラリ名、または `"田中傘"` などの表示名。
- `version`: ボイスライブラリのバージョン。既定は選択した声のインストール済みの最新版。
- `language`: `"ja_JP"` などの言語コード。既定はその声の一覧の最初の言語。
- `speed`: API の単位での話す速さ。
- `pitch`: 声の高さの調整（セント）。
- `volume`: 合成時の音量（dB）。
- `alp`: 声質のパラメータ（`alp`）。
- `huskiness`: 声のかすれ具合。
- `intonation`: 抑揚の強さ。
- `style`: スタイル名と強さの辞書。`happy` がある声なら `{ happy: 0.5 }` など。指定しないスタイルはその声の既定の強さを使います。
- `max-chars`: 1回の合成リクエストの最大文字数。既定は `500`。
- `url`: API のベース URL。既定は `http://localhost:32766`。`/api/talk/v1` は含めません。

省略した数値設定は API の既定値を使います。`/api/talk/v1/voices` で声・バージョン・言語、`/api/talk/v1/voices/<voice_name>/<voice_version>` で `style_names`・`default_style_weights` を確認できます。表示名が重複する場合は `voice_name` を指定します。長文は句読点の近くで分割して一つの WAV に結合し、`gap` は全体の後に入れます。

### テキスト・時間・キャッシュ

`<Voisona>` は、どの読み上げ部品とも共通の[テキストと時間の属性](../speech/README.jp.md#テキストと時間)を受け取り、同じように[音声をキャッシュ](../speech/README.jp.md#キャッシュとプレビュー)します。`name` の既定は `voice` です。

### 接続

接続先は `url` → `MEKURU_VOISONA_URL` → 既定 URL の順で決まります。Bun と同じ環境から確認します。

```sh
curl --user "$MEKURU_VOISONA_USER" http://localhost:32766/api/talk/v1/voices
```

curl に API パスワードを入力します。HTTP 401 はメールアドレスと API パスワードを確認してください。接続できない場合は起動状態とポートを確認します。Windows のエンジンには [WSL の mirrored ネットワーク](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)で `127.0.0.1` から接続できます。`localhost` で失敗する場合は `MEKURU_VOISONA_URL=http://127.0.0.1:32766` を指定します。

独自のナレータでは `await Voisona.prepare({ ...声の設定, text })` で音声素材・表示文字・長さをまとめて取得できます。`id`・`at` は配置する部品に付けます。[共有する音声素材](../speech/README.jp.md#共有する音声素材)と[ナレータの組み立て](../narrator/README.jp.md)を参照してください。
