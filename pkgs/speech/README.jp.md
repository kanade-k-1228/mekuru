# @mekuru/speech

[English](README.md)

Mekuru Movie Maker の読み上げ部品を実装するためのユーティリティです。既存のエンジンを使う場合は、それぞれのセットアップと使用方法を参照してください: [VOICEVOX](../voicevox/README.jp.md)・[COEIROINK](../coeiroink/README.jp.md)・[Style-Bert-VITS2](../style-bert-vits2/README.jp.md)・[VoiSona Talk](../voisona/README.jp.md)。

## セットアップ

Bun 1.4 以上と `@mekuru/types` が必要です。プロジェクトのフォルダから台本を実行すると、そのプロジェクトの `.mekuru/cache/tts/` に音声が保存されます。

```sh
bun add -d @mekuru/types @mekuru/speech
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/types"` を設定します。テキストと声の設定を受け取り、指定されたパスへ WAV を書き出し、保存が完了してから解決するエンジン用の関数を用意してください。

## 簡単な使い方

次の再利用できるアダプターを `src/speech.tsx` に保存します。

```tsx
import { defineSpeech, prepare, type SpeechProps } from "@mekuru/speech";

interface CustomSpeechProps extends SpeechProps {
  speaker: string;
}

type Synthesize = (text: string, output: string, voice: { speaker: string }) => Promise<void>;

export const createSpeech = (synthesize: Synthesize) =>
  defineSpeech<CustomSpeechProps>(async (props) => {
    const voice = { speaker: props.speaker };
    return prepare("my-engine", props, props.speaker, voice, (text, output) =>
      synthesize(text, output, voice),
    );
  });
```

`createSpeech()` に WAV を書き出すコールバックを渡し、返された部品を `<mekuru>` 内に置きます。`"my-engine"` は自分のエンジンの識別名に置き換えます。`defineSpeech()` は準備済みの音声を JSX（`<dur><audio /></dur>`）として返し、`writeXml()`・`toXml()` の展開中にフレームレートを参照します。HTTP API を持つエンジンなら [`defineEngine()`](#defineengineengine) が残りを引き受けます。

## 詳しい使い方

### prepare(kind, props, who, voice, synthesize)

- `kind`: キャッシュのキーに使うエンジンの識別名。
- `props`: セリフと時間の設定を含む `SpeechProps`。
- `who`: `props.name` が省略されたときの話者名。
- `voice`: 合成する声を決めるシリアライズ可能な設定。キャッシュのキーに含みます。
- `synthesize`: `(text: string, output: string) => Promise<void>`。完成した WAV を `output` に書き出します。

キャッシュのキーは `kind`・`voice`・変換後のテキストです。`voice` に合成結果を決める設定を含め、接続先を変えても音声を再利用する場合は接続情報を除きます。

`SpeechProps` のフィールド:

- `children`: セリフ。文字列・数値・フラグメント・`<br />` に対応します。読み上げる内容が空の場合はエラーです。
- `name`: タイムラインの話者名。既定は `who`。
- `reading`: 読みの辞書。長いキーを優先し、読み上げるテキストだけを変えます。
- `gap`: セリフの後の無音（フレーム）。既定は `Math.round(0.3 * fps)`。
- `gain-db`: 再生時の音量（dB）。キャッシュする WAV は変えません。
- `len`: 全体の長さ（フレーム）。省略時は、音声の長さをフレームに切り上げて `gap` を足します。
- `id`・`at`: 外側の `<dur>` に渡します。[時間の属性](../../docs/reference/Syntax.jp.md#時間の属性)を参照してください。

`｜表示《よみ》` のルビは「よみ」を合成に、「表示」をラベルに使います。半角の `|` も使え、漢字なら `漢字《かんじ》` のように区切りを省けます。`<br />` は空白になります。文字や `<br />` を返す同期・非同期の部品も使えます。それ以外の要素はエラーです。

キャッシュがなければ、`writeXml()` は無音の下書きを出し、合成後に更新します。見積もりは1文字0.15秒と `gap` の合計（`len` 指定時はその値）。下書きの外で呼ぶ `toXml()` は合成を待ちます。

### 共有する音声素材

エンジンの `Voisona.prepare(props)`・`Voicevox.prepare(props)`・`Coeiroink.prepare(props)`・`StyleBertVits2.prepare(props)` は `PreparedLine` を返します。`children` と声・読み・長さの設定を渡し、`id`・`at` は返された素材を配置する側に付けます。`<mekuru>` 内の非同期部品で呼びます。

- `line.audio`: 読み取り専用の `AudioSource`（型は `@mekuru/audio`）。`status` は `draft` または `ready`。`len` は句末の間を含むフレーム数、`label` と `volume` は再生時の設定。完成版の `src` は絶対パスです。
- `line.display`: ルビの表記部分・空白・改行を保持した表示用 Node。文字コンポーネントは準備時に一度だけ展開します。
- `<Audio source={line.audio} id="line" />`: 素材を既存の `<dur><audio /></dur>` に展開します。
- `readAudio(src, { gap?, len?, label?, volume? })`: 既存の WAV から同じ素材を作ります。`gap` の既定値は 0。相対パスは構築開始時のプロジェクトが基準です。

独自エンジンは `prepare()` で `{ audio, display }` を作り、`defineSpeech()` で JSX と `.prepare()` を提供します。旧 `line()` はこの構成に、旧 `line.len` は `line.audio.len` に移行してください。

下書きでは見積もりの素材を返して合成を予約し、完成版では実際の WAV と長さを返します。どちらも同じ部品で表示できます。キャッシュ基準・進捗・実行中の合成は一回の構築に属し、import 時点の作業フォルダには依存しません。

### その他のエクスポート

- `await subtitleText(children)`: ルビを表示文字に変換し、空白と `<br />` を保持した Node を返します。純粋な文字処理の入口 `@mekuru/speech/text` からも使えます。読み上げと同じ入力形式を使います。字幕の配置・装飾には [@mekuru/narrator](../narrator/README.jp.md) の `Subtitle` を使えます。
- `joinWavs(parts)`: フォーマットチャンクが同一の WAV バッファを連結します。空でない配列を渡します。リサンプリングや音声形式の変換は行いません。

### defineEngine(engine)

同梱のエンジンと同じく、HTTP API を持つエンジンの部品を作ります（例: [VOICEVOX](../voicevox/src/index.tsx)）。

```tsx
import { defineEngine, type EngineProps } from "@mekuru/speech";

interface MySpeechProps extends EngineProps {
  speaker: number;
}

export const MySpeech = defineEngine<MySpeechProps>({
  kind: "my-engine",
  name: "My engine",
  env: "MY_ENGINE_URL",
  defaultUrl: "http://127.0.0.1:8000",
  help: "  - start My engine",
  concurrency: 1,
  who: (props) => String(props.speaker),
  create: (call) => async (voice, text) =>
    (await call("/synthesis", { method: "POST", body: JSON.stringify({ ...voice, text }) })).arrayBuffer(),
});
```

- 属性は `EngineProps`（`SpeechProps` に `url` と `max-chars` を加えたもの）を拡張します。
- 接続先は `url` 属性、なければ環境変数 `env`、なければ `defaultUrl` です。接続先ごとに `create(call, url)` で読み上げ関数を作り、同時に `concurrency` 本まで合成します。
- `call(path, init)` は接続先にリクエストを送ります（タイムアウトは5分）。接続できなければ `help` を、HTTP エラーなら `name`・パス・ステータスをエラーに含めます。
- 読み上げ関数は `voice`（`SpeechProps` と `url` 以外の属性。キャッシュのキーにもなる）とテキストを受け取り、WAV のバイト列を返します。
- `max-chars` 属性（既定は `maxChars`。どちらもなければ制限なし）より長いセリフは、句読点の近くで分割して順に読み、結合します。
- `who(props)` は `name` を省略したときの話者名です。
- `cached(load)` は話者一覧など、読み上げ関数が接続先ごとに一度だけ読むものを保持します。読み込みに失敗したら次のセリフで読み直します。戻り値の関数に `true` を渡すと必ず読み直します。

### 下書きを独自に扱う場合

`@mekuru/types` の `isDraft()`・`waitFor()` を使い、合成の Promise を登録します。下書きでは `<dur len={estimatedFrames}><audio draft label="..." /></dur>`、完成版では生成済みの `src` を持つ音声を返します。`label` がある音声はタイムラインの読み上げ行に出ます。`waitFor()` が完成版の更新を予約するのは `writeXml()` の中だけです。

`Audio` と `readAudio` は `@mekuru/audio`、`joinWavs` は `@mekuru/audio/wav` が提供します。
