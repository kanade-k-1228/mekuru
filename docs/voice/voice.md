# 声の設定

- セリフは読み上げの部品で書く。台本を書き出す時に音声を合成し、`<audio>` になる
- 部品はエンジンごとのパッケージにある（`bun add -d @mekuru/coeiroink` などで追加）

| エンジン                                         | パッケージ                | 部品               | 動く所                     |
| ------------------------------------------------ | ------------------------- | ------------------ | -------------------------- |
| VOICEVOX（AivisSpeech・SHAREVOX など同じ API も） | `@mekuru/voicevox`         | `<Voicevox>`       | Windows・macOS・Linux      |
| COEIROINK（v2）                                  | `@mekuru/coeiroink`        | `<Coeiroink>`      | Windows・macOS・Linux      |
| Style-Bert-VITS2                                 | `@mekuru/style-bert-vits2` | `<StyleBertVits2>` | API サーバーを動かせる所   |

```tsx
// example/src/parts.tsx（抜粋）
const READING: Record<string, string> = {
  Mekuru: "めくる",
  …
  VOICEVOX: "ボイスボックス",
  …
};
…
const voice = { name: "sasara", speaker: "冥鳴ひまり", speed: 1.15, intonation: 1.25, gap: 6, reading: READING };
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

```xml
<!-- example が書き出す .mekuru/main.xml から（抜粋）: 合成した音声 -->
<dur len="24">
  <audio src=".mekuru/cache/tts/b5/b592ff….wav" label="sasara: はーい！"/>
</dur>
```

- example の部品（[`example/src/parts.tsx`](../../example/src/parts.tsx)）。`<sasara.Talk>` は[立ち絵](../reference/Portrait.md)、`<Subtitle>` は字幕の `<text>`
- 置いた `<stack>` の始まりから読み上げる。字幕は同じ `<stack>` の `<text>`
- 中の文字には `<br />` とルビ `｜表示《よみ》` が使える（読み上げは「よみ」を読む）
  - `|`（半角）も使える。漢字のすぐあとなら `｜` は省ける（`漢字《かんじ》`）
- エンジンに渡す数値（`speed`・`pre` など）は、そのエンジンの単位のまま。`gap`・`len` は動画のフレーム数

## 共通の props

- `name`: タイムラインに出す名前（既定は `speaker`・`cast` など）
- `reading`: 読みの辞書（`{ Mekuru: "めくる" }`）。読み上げる時だけ置き換える（長い言葉が優先）
- `gap`: セリフのあとの無音（フレーム。既定は 0.3 秒ぶん）
- `gain-db`: 音量（dB）
- `id`・`at`: 読み上げの `<dur>` に渡す
- `len`: 読み上げの長さ（フレーム）。省くと、音声の長さ（フレームに切り上げる）に `gap` を足したもの

## `<Voicevox>`

- `speaker`（必須）: スタイル ID か `"ずんだもん/ノーマル"`（名前だけなら最初のスタイル。一覧は `http://127.0.0.1:50021/speakers`）
- `speed`・`pitch`・`intonation`・`volume`
- `pre`・`post`: 前後の無音（秒）
- `pause-scale`: 間の長さの倍率
- `url`: 既定 `http://127.0.0.1:50021`（環境変数 `MEKURU_VOICEVOX_URL`）
- 同じ API のエンジン
  - AivisSpeech: `url="http://127.0.0.1:10101"`（`speaker` は名前で書くと楽）
  - SHAREVOX: `url="http://127.0.0.1:50025"`

## `<Coeiroink>`

- `speaker`（必須）: 名前か `"つくよみちゃん/れいせい"`（speakerUuid・スタイル ID も可。名前だけなら最初のスタイル）
- `speed`・`pitch`・`intonation`・`volume`: 標準は 1・0・1・1
- `pre`・`post`: 前後の無音（秒。既定 0.1）
- `pause`: 「、」の無音（秒）
- `url`: 既定 `http://127.0.0.1:50032`（環境変数 `MEKURU_COEIROINK_URL`）
- キャラクターは、アプリの「キャラクターダウンロード」で追加して再起動する
- クレジット表記（「COEIROINK:つくよみちゃん」など）が必須

## `<StyleBertVits2>`

- `model`（必須）: `model_assets` のフォルダ名（`"jvnv-F1-jp"` など。一覧は `/models/info`）
- `speaker`: 名前か ID（既定 0）
- `style`・`style-weight`: 既定 `"Neutral"`・1
- `sdp-ratio`・`noise`・`noise-w`: 既定 0.2・0.6・0.8
- `length`: 話す長さの倍率（既定 1）
- `language`: `"JP"`・`"EN"`・`"ZH"`（既定 `"JP"`）
- `assist-text`・`assist-text-weight`: 声色を似せるテキストと強さ（既定 1）
- `max-chars`: 既定 100。サーバーの `server.limit` に合わせる
- `url`: 既定 `http://127.0.0.1:5000`（環境変数 `MEKURU_STYLE_BERT_VITS2_URL`）
- サーバーは `python server_fastapi.py`（Windows は `Server.bat`）で起動する
- モデルごとの利用規約を確認する

## キャッシュ

- 合成した音声は `.mekuru/cache/tts/` に、声の設定とテキストのハッシュで保存する
- 変えた行だけ合成し直す（エンジンの場所はハッシュに含まない）
- キャッシュがあれば、エンジンなしで書き出せる

## 部品を自分で作る

- WAV を作って `<audio>` を返す `async` の部品にする（台本を書き出す時に呼ばれる）
- `label` 付きの `<audio>` は、タイムラインの「読み上げ」の行に出る
- `@mekuru/speech` の `line()` を使うと、ルビ・`reading`・キャッシュ・`gap`・下書きを共通にできる（`<audio {...await line(…)} />`）
- `line()` を使わずに下書きに対応するには、`@mekuru/core` の `isDraft()` と `waitFor()` を使う
  - `isDraft()` が真のときは合成を待たず、合成の Promise を `waitFor()` に渡して、`src` なしで長さを見積もった `<audio>` を返す
  - `writeXml` は下書きを書き出したあと、`waitFor()` に渡したものを待って書き直す（`writeXml` の外では何もしない）
