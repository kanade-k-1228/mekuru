# @mekuru/speech

[English](README.md)

**irodoru と VOICEVOX** の読み上げ部品です。各 API の設定と通信は独立し、WAVキャッシュ・字幕・動画上の時間だけを共有します。`Speech` は生成設定を `POST /` に送り、WAV をローカルにキャッシュします。音声・字幕・口パクで使う時間と表示テキストを提供します。

## 準備

Bun 1.4 以上が必要です。`tsconfig.json` に `jsx: "react-jsx"`、`jsxImportSource: "@mekuru/tsx"` を設定します（`bun create @mekuru` では設定済み）。

```sh
bun add -d @mekuru/tsx @mekuru/core @mekuru/speech
```

サンプルプロジェクトでは `bun run irodoru` を別のターミナルで起動したままにします（Docker が必要）。モデル入りの公開イメージを使います。単独で起動する場合:

```sh
docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/kanade-k-1228/irodoru:latest-mf
```

初回はイメージを取得します。ローカルでのモデル変換やビルドは不要です。終了は Ctrl+C。モデルのロードが終わるまで待ってから、Bun の実行環境から接続を確認します。`latest-mf` を更新するときは `docker pull ghcr.io/kanade-k-1228/irodoru:latest-mf` を実行します。再現性が必要なプロジェクトでは `package.json` のイメージを公開済みバージョンや digest に固定してください。

```sh
curl http://127.0.0.1:8080/ -H 'content-type: application/json' \
  -d '{"text":"こんにちは","caption":"落ち着いた声","seed":1}' -o out.wav
```

接続先は `url` → `MEKURU_IRODORU_URL` → `http://127.0.0.1:8080` の順で決まります。合成先はサーバーの `/` です。ヘルスチェック用の API はなく、上のコマンドは実際に音声を生成します。Windows/WSL では Bun からその接続先に到達できるようネットワークを設定します。使用するモデル・参照音声・キャラクター素材の利用規約に従ってください。

## Speech

```tsx
import { writeXml } from "@mekuru/tsx";
import { Speech, type SpeechProps } from "@mekuru/speech";

const narrator = {
  name: "ナレーター",
  caption: "落ち着いた、聞き取りやすい女性の声",
  seed: 1,
} satisfies Omit<SpeechProps, "text">;

await writeXml(".mekuru/main.xml", (
  <mekuru fps={30}>
    <seq>
      <Speech {...narrator} text="こんにちは。" />
      <Speech {...narrator} text="今日の内容を紹介します。" />
    </seq>
  </mekuru>
));
```

キャラクターの設定は通常のオブジェクトや自作部品として共有します。`caption` は声質や話し方の説明、`reference_audio_base64` は Base64 エンコードした参照 WAV です。参照音声は省略でき、caption と併用できます。`Buffer.from(await Bun.file("voice.wav").arrayBuffer()).toString("base64")` で渡せます。参照音声は0.5秒以上、JSON 全体は64MiB以下にします。

### 生成設定

エンジン共通の属性への変換は行わず、irodoru の API 名をそのまま使用します。モデルは起動する Docker イメージの `latest-mf` / `latest-small` / `latest-anime` で選択します。同じ接続先でモデルを切り替えたら `.mekuru/cache/tts/` を削除して再生成してください。

| 属性 | 既定値・意味 |
| --- | --- |
| `reference_audio_base64` | 参照 WAV の Base64 文字列。省略時は参照なし。 |
| `caption` | 声質・話し方の説明。 |
| `seed` | `1`。非負の安全な整数。別テイクが欲しい場合は変更します。 |
| `num_steps` | モデルの既定値。指定する場合は1〜200の整数。 |
| `cfg_scale_text`・`cfg_scale_speaker`・`cfg_scale_caption` | `3`・`5`・`3`。RF モデル用の設定。 |
| `cfg_min_t`・`cfg_max_t` | `0.5`・`1`。 |
| `t_schedule`・`sway_coeff` | `"linear"`。`"sway"` の場合、係数の既定値は `-1`。 |
| `duration_scale` | `1`。予測長の倍率。0より大きく5以下。 |
| `seconds` | 合成音声の目標秒数。指定する場合は0.5〜30秒。 |
| `trim_tail` | `true`。末尾の無音を除去。 |

モデル依存の `num_steps` 以外は既定値を明示して送信します。シードは省略時も固定しますが、モデルや実行環境を変更した場合の波形の完全一致は保証しません。同じ caption とシードだけではセリフ間の声質が一定になるとは限らないため、声を揃えたい場合は参照ボイスを使います。

### テキストと時間

- `text`: 必須。文字列またはテキストだけを返す JSX。children は使いません。`\n` は字幕では改行、読み上げでは空白になります。
- `reading`: 単語と読みの辞書。最長一致で置換し、表示テキストは変えません。
- `name`: タイムラインの話者ラベル。既定は `Speech` では `"irodoru"`、`Voicevox` では speaker。
- `gap`: セリフ末尾の余白（フレーム）。既定は0.3秒を最も近いフレーム数に丸めた値。
- `gain-db`: 再生時の音量（dB）。合成音声自体は変えません。
- `id`・`at`: セリフの配置。
- `len`: 動画上の長さ（フレーム）。WAV の実測長＋gap を上書きします。合成長を指定する `seconds` とは別です。
- `max-chars`: 1リクエストの最大文字数。Unicode コードポイントで1〜1,000の整数、既定100。長文は句読点を優先して分割し、WAVを連結します。各断片は同じ設定とシードで生成し、gap は全体の最後だけに付きます。

irodoru は1リクエスト最大1,000文字・生成長最大30秒です。文字数だけでは読み切れる保証がないため、必要ならセリフを短くするか `max-chars` を下げます。`seconds` 指定なしで30秒付近の音声が返った場合は警告を表示します。複数断片に分割されるセリフと `seconds` は併用できません。セリフを短くするか、複数の `Speech` に分けてください。

## 字幕・立ち絵と組み合わせる

```tsx
import { Audio } from "@mekuru/audio";
import { Speech } from "@mekuru/speech";
import { Subtitle } from "@mekuru/narrator";

const Narrator = async ({ text }: { text: string }) => {
  const line = await Speech.prepare({ caption: "落ち着いた声", text });
  return (
    <dur len={line.audio.len}>
      <stack>
        <Audio source={line.audio} />
        <Subtitle text={line.display} />
      </stack>
    </dur>
  );
};
```

`Speech.prepare()` は `writeXml()`・`toXml()` で展開する `<mekuru>` 内の非同期部品から呼びます。凍結された `PreparedLine`（`audio: AudioSource` と `display: string`）を返します。同じ音声を立ち絵の `Talk` に渡すと口パクも同期します。`id`・`at` は配置側の部品に指定します。[ナレータの組み立て](../narrator/README.jp.md)を参照してください。

`subtitleText(text)` は音声合成なしでテキスト JSX を表示文字列に展開します。ルートの export は `Speech`・`SpeechProps`・`LineProps`・`PreparedLine`・`subtitleText` です。`@mekuru/speech/irodoru` からも `Speech` を import できます。VOICEVOX は専用のサブパスから import します。

生成条件（model・seed・steps など）は WAV 内の `LIST/INFO/ICMT` チャンクに含まれます。クライアントは WAV のサンプルから長さを求めます。単一リクエストの WAV はメタデータを含めそのまま保存します。長文分割後の連結 WAV は音声のみを連結し、個別の生成条件は保持しません。

## キャッシュとプレビュー

音声は `.mekuru/cache/tts/` に保存します。キーには正規化した接続先・生成設定・分割後の読み上げテキスト・分割上限・キャッシュ形式バージョンを含めます。読み上げ内容が同じなら、表示名・配置・音量・字幕だけの変更・gap・len の変更では再合成しません。既定値の明示と省略は同じキャッシュになります。

キャッシュ済み音声はサーバー停止中も利用でき、irodoru では一覧取得を行いません。VOICEVOX の名前解決はキャッシュがない場合だけ行います。同名のモデルや VOICEVOX の話者データを差し替えた場合は `.mekuru/cache/tts/` を削除して再生成してください。オフラインでリモートの変更は検出できません。irodoru の参照音声は内容をキーに含めるため、変更時に再生成します。

生成中の同じセリフはリクエストを共有します。irodoru は接続先ごとに1件ずつ処理し、ローカルの待ち行列を抜けてから各リクエストに5分のタイムアウトを設定します。HTTP エラーや不正・空の WAV はキャッシュに保存せず、次回ビルドで再試行できます。

未生成のセリフは `writeXml()` が推定長で先にプレビューを出し、生成完了後に WAV の長さへ更新します。`toXml()` は完成音声を待ちます。テキストは各パスで一度展開し、音声・字幕・立ち絵で共有します。

## VOICEVOX

サンプルプロジェクトでは `bun run voicevox` を別のターミナルで起動します。VOICEVOX アプリを起動する方法でも構いません。Docker の起動コマンドは次のとおりです。

```sh
docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest
```

```tsx
import { Voicevox, zunda } from "@mekuru/speech/voicevox";

<Voicevox {...zunda} speed={1.2} text="こんにちは、ずんだもんなのだ。" />;
const line = await Voicevox.prepare({ ...zunda, text: "字幕や口パクと組み合わせるのだ。" });
```

`speaker` は話者スタイル ID または `"ずんだもん/ノーマル"` のような名前です。名前指定時は未生成のセリフについて `/speakers` から解決します。設定可能な属性は `speed`・`pitch`・`intonation`・`volume`・`pre`・`post`・`pause-scale`。未指定の値は `/audio_query` が返した値を使います。`volume` は合成設定、`gain-db` は再生音量です。

接続先は `url` → `MEKURU_VOICEVOX_URL` → `http://127.0.0.1:50021` の順です。`Speech` と同じテキスト・時間属性（`LineProps`）を受け取り、`.prepare()` は同じ `PreparedLine` を返します。キャッシュはエンジンごとに区別され、キャッシュ済みなら `/speakers` を含め通信しません。irodoru の設定・環境変数・通信処理には依存しません。

`VOICEVOX:ずんだもん` など、利用する音声に必要なクレジットを記載してください。
