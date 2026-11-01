# @mekuru/speech

[English](README.md)

Mekuru Movie Maker の読み上げ部品を実装するためのユーティリティです。既存のエンジンを使う場合は、それぞれのセットアップと使用方法を参照してください: [VOICEVOX](../voicevox/README.jp.md)・[COEIROINK](../coeiroink/README.jp.md)・[Style-Bert-VITS2](../style-bert-vits2/README.jp.md)・[VoiSona Talk](../voisona/README.jp.md)。

## セットアップ

Bun 1.4 以上と `@mekuru/core` が必要です。プロジェクトのフォルダから台本を実行すると、そのプロジェクトの `.mekuru/cache/tts/` に音声が保存されます。

```sh
bun add -d @mekuru/core @mekuru/speech
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/core"` を設定します。テキストと声の設定を受け取り、指定されたパスへ WAV を書き出し、保存が完了してから解決するエンジン用の関数を用意してください。

## 簡単な使い方

次の再利用できるアダプターを `src/speech.tsx` に保存します。

```tsx
import { line, voiceOf, type SpeechProps } from "@mekuru/speech";

interface CustomSpeechProps extends SpeechProps {
  speaker: string;
}

type Synthesize = (text: string, output: string, voice: { speaker: string }) => Promise<void>;

export const createSpeech = (synthesize: Synthesize) =>
  async (props: CustomSpeechProps) => {
    const voice = voiceOf(props);
    return line("my-engine", props, props.speaker, voice, (text, output) =>
      synthesize(text, output, voice),
    );
  };
```

`createSpeech()` に WAV を書き出すコールバックを渡し、返された部品を `<mekuru>` 内に置きます。`"my-engine"` は自分のエンジンの識別名に置き換えます。`line()` は JSX（`<dur><audio /></dur>`）を返し、`writeXml()`・`toXml()` の展開中にフレームレートを参照します。

## 詳しい使い方

### line(kind, props, who, voice, synthesize)

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

`｜表示《よみ》` のルビは「よみ」を合成に、「表示」をラベルに使います。半角の `|` も使え、漢字なら `漢字《かんじ》` のように区切りを省けます。`<br />` は空白になります。ほかの要素や部品をセリフの中に置くとエラーです。

キャッシュがなければ、`writeXml()` は無音の下書きを出し、合成後に更新します。見積もりは1文字0.15秒と `gap` の合計（`len` 指定時はその値）。下書きの外で呼ぶ `toXml()` は合成を待ちます。

### その他のエクスポート

- `voiceOf(props)`: `SpeechProps` のフィールドを除き、残ったエンジンの設定を返します。接続先だけを表す `url` は、キャッシュのキーに使う前に自分で除きます。
- `joinWavs(parts)`: フォーマットチャンクが同一の WAV バッファを連結します。空でない配列を渡します。リサンプリングや音声形式の変換は行いません。

`@mekuru/speech/engine` から使えるもの:

- `httpClient(url, name, help)`: `url + path` に HTTP リクエストを送る関数を返します。5分のタイムアウトと、エンジン別の接続案内または HTTP ステータス付きのエラーを付けます。必要な認証はアダプター側で追加します。
- `limit(concurrency)`: 非同期処理のキューを返します。上限は正の整数。エンジンやサーバーごとに一つ作り、同時実行数を制限します。
- `splitText(text, max)`: Unicode のコードポイント数で最大 `max` 文字に分割し、句読点や空白を優先します。各部分の前後の空白と空の部分は除きます。

### 下書きを独自に扱う場合

`@mekuru/core` の `isDraft()`・`waitFor()` を使い、合成の Promise を登録します。下書きでは `<dur len={estimatedFrames}><audio draft label="..." /></dur>`、完成版では生成済みの `src` を持つ音声を返します。`label` がある音声はタイムラインの読み上げ行に出ます。`waitFor()` が完成版の更新を予約するのは `writeXml()` の中だけです。
