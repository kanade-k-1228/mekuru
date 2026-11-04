# @mekuru/speech

[English](README.md)

Mekuru Movie Maker のセリフを音声合成エンジンで読み上げる部品です。VOICEVOX・AivisSpeech・SHAREVOX は `Voicevox`、COEIROINK は `Coeiroink`、Style-Bert-VITS2 は `StyleBertVits2`、VoiSona Talk は `Voisona` で読み上げます。エンジンの部品とキャラクターの設定は `@mekuru/speech/voicevox` などエンジンごとのパスから、共通の API は `@mekuru/speech` から import します。どの部品も共通の[テキストと時間の属性](#テキストと時間)を受け取り、同じように[音声をキャッシュ](#キャッシュとプレビュー)します。ほかのエンジンは [`defineEngine()`](#defineengineengine) や [`prepare()`](#preparekind-props-who-voice-synthesize) で追加できます。

## セットアップ

Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・日本語フォントを用意し、プロジェクトに追加します。

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/speech
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/types"` を設定します。`bun create @mekuru` では設定済みです。使うエンジンは[エンジン](#エンジン)の手順で準備します。

## 簡単な使い方

VOICEVOX を起動し、`src/main.tsx` に保存します。

```tsx
import { writeXml } from "@mekuru/types";
import { Voicevox } from "@mekuru/speech/voicevox";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Voicevox speaker="ずんだもん/ノーマル" text={text} />
      <text x="50%" y="50%" anchor="center" size={60} color="#FFFFFF" text={text} />
    </stack>
  </mekuru>,
);
```

```sh
bun src/main.tsx
bunx mekuru-compiler .mekuru/main.xml --serve
```

`http://localhost:3333` でプレビューします。書き出しは `bunx mekuru-compiler .mekuru/main.xml -o video.mp4`。台本はプロジェクトのフォルダから実行します。音声はそのプロジェクトの `.mekuru/cache/tts/` に保存されます。

ほかのエンジンでは import 元・部品・声の設定を置き換えます。

```tsx
import { Coeiroink } from "@mekuru/speech/coeiroink";
import { StyleBertVits2 } from "@mekuru/speech/style-bert-vits2";
import { Voisona } from "@mekuru/speech/voisona";

<Coeiroink speaker="つくよみちゃん/れいせい" text={text} />;
<StyleBertVits2 model="jvnv-F1-jp" text={text} />;
<Voisona voice="tanaka-san_ja_JP" text={text} />;
```

## エンジン

| import 元 | 部品 | エンジン | 既定の接続先 | 環境変数 | `name` の既定 |
| --- | --- | --- | --- | --- | --- |
| [`@mekuru/speech/voicevox`](#voicevox) | `Voicevox` | VOICEVOX・AivisSpeech・SHAREVOX | `http://127.0.0.1:50021` | `MEKURU_VOICEVOX_URL` | `speaker` |
| [`@mekuru/speech/coeiroink`](#coeiroink) | `Coeiroink` | COEIROINK v2 | `http://127.0.0.1:50032` | `MEKURU_COEIROINK_URL` | `speaker` |
| [`@mekuru/speech/style-bert-vits2`](#style-bert-vits2) | `StyleBertVits2` | Style-Bert-VITS2 | `http://127.0.0.1:5000` | `MEKURU_STYLE_BERT_VITS2_URL` | `speaker`（省略時は `model`） |
| [`@mekuru/speech/voisona`](#voisona-talk) | `Voisona` | VoiSona Talk | `http://localhost:32766` | `MEKURU_VOISONA_URL` | `voice` |

どの部品も、声の設定と[テキストと時間の属性](#テキストと時間)のほかに次を受け取ります。

- `url`: エンジンのベース URL。`url` → 表の環境変数 → 既定の接続先の順で決まります。
- `max-chars`: 1回の合成リクエストの最大文字数。長いセリフは句読点の近くで分割して順に合成し、一つの WAV に結合します。`gap` はセリフ全体の後に入ります。既定は制限なし（Style-Bert-VITS2 は `100`、VoiSona Talk は `500`）。

接続は Bun と同じ環境から、各エンジンの節の `curl` で確認します。接続できない場合は起動状態とポートを確認します。Windows のエンジンには [WSL の mirrored ネットワーク](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)で `127.0.0.1` から接続できます。

キャラクターごとの設定も、部品と同じパスからエクスポートしています。部品に展開して使い、ほかの props も追加できます。

```tsx
import { Voicevox, zunda } from "@mekuru/speech/voicevox";

<Voicevox {...zunda} text="こんにちは。" />;
```

### VOICEVOX

`@mekuru/speech/voicevox` の `<Voicevox>` は VOICEVOX または API 互換のエンジンで読み上げます。Windows・macOS・Linux で [VOICEVOX](https://voicevox.hiroshiba.jp/how_to_use/) を起動します。[利用規約](https://voicevox.hiroshiba.jp/term/)とキャラクターの規約に従い、`VOICEVOX:ずんだもん` などのクレジットを記載してください。話者・スタイルは次で確認できます。

```sh
curl http://127.0.0.1:50021/speakers
```

声の設定（`VoicevoxProps`）:

- `speaker`: 必須: 数値のスタイル ID、数字の文字列、または `"ずんだもん/ノーマル"` のような `"話者名/スタイル名"`。話者名だけなら最初のスタイルを選びます。
- `speed`: 話す速さ（`speedScale`）。
- `pitch`: 声の高さ（`pitchScale`）。エンジンの単位で指定します。
- `intonation`: 抑揚の強さ（`intonationScale`）。
- `volume`: 合成時の音量（`volumeScale`）。
- `pre`・`post`: 読み上げの前後の無音（秒）。
- `pause-scale`: 間の長さの倍率（`pauseLengthScale`）。

省略した合成設定は `/audio_query` の値を使います。互換エンジンは `url` に AivisSpeech の `http://127.0.0.1:10101`、SHAREVOX の `http://127.0.0.1:50025` を指定し、そのエンジンの `/speakers` から話者を選びます。

| エクスポート | 名前 | `speaker` | エンジン |
| --- | --- | --- | --- |
| `zunda` | ずんだもん | `3` | VOICEVOX |
| `metan` | 四国めたん | `2` | VOICEVOX |
| `tsumugi` | 春日部つむぎ | `8` | VOICEVOX |
| `hau` | 雨晴はう | `10` | VOICEVOX |
| `ritsu` | 波音リツ | `9` | VOICEVOX |
| `takehiro` | 玄野武宏 | `11` | VOICEVOX |
| `kotaro` | 白上虎太郎 | `12` | VOICEVOX |
| `ryusei` | 青山龍星 | `13` | VOICEVOX |
| `himari` | 冥鳴ひまり | `14` | VOICEVOX |
| `sora` | 九州そら | `16` | VOICEVOX |
| `mochiko` | もち子さん | `20` | VOICEVOX |
| `mesuo` | 剣崎雌雄 | `21` | VOICEVOX |
| `zunko` | 東北ずん子 | `107` | VOICEVOX |
| `kiritan` | 東北きりたん | `108` | VOICEVOX |
| `itako` | 東北イタコ | `109` | VOICEVOX |
| `kohaku` | コハク | `"コハク"` | AivisSpeech |
| `mao` | まお | `"まお"` | AivisSpeech |
| `koharuneAmiSharevox` | 小春音アミ | `14` | SHAREVOX |
| `tsukuyomiSharevox` | つくよみちゃん | `18` | SHAREVOX |
| `ykun` | Yくん | `19` | SHAREVOX |
| `hakuchi` | 白痴ー | `20` | SHAREVOX |
| `lagopusBlack` | らごぱすブラック | `21` | SHAREVOX |
| `lagopusWhite` | らごぱすホワイト | `22` | SHAREVOX |
| `yuki` | 風花ゆき | `23` | SHAREVOX |
| `hiroha` | 安倍広葉 | `24` | SHAREVOX |
| `suzuno` | 鈴乃 | `25` | SHAREVOX |

AivisSpeech・SHAREVOX のキャラクターは、`url` を `MEKURU_AIVISSPEECH_URL`・`MEKURU_SHAREVOX_URL`（未設定ならそれぞれの既定のポート）から設定します。

### COEIROINK

`@mekuru/speech/coeiroink` の `<Coeiroink>` は COEIROINK v2 で読み上げます。[COEIROINK v2](https://coeiroink.com/download) をインストールし、「キャラクターダウンロード」で声を追加して再起動します。`COEIROINK:つくよみちゃん` などのクレジットを記載し、声の利用規約に従ってください。名前・UUID・スタイルは次で確認できます。

```sh
curl http://127.0.0.1:50032/v1/speakers
```

声の設定（`CoeiroinkProps`）:

- `speaker`: 必須: 話者名、`"話者名/スタイル名"`、speakerUuid（`/スタイル名` も指定可）、または数値のスタイル ID。名前・UUID だけなら最初のスタイルを選びます。
- `speed`: 話す速さの倍率。既定は `1`。
- `pitch`: COEIROINK の単位での声の高さの調整。既定は `0`。
- `intonation`: 抑揚の強さ。既定は `1`。
- `volume`: 合成時の音量の倍率。既定は `1`。
- `pre`・`post`: 読み上げの前後の無音（秒）。既定はそれぞれ `0.1`。
- `pause`: 「、」などの句読点の無音（秒）。既定では省略し、エンジンに任せます。

話者が見つからない場合は、エラーに利用可能な話者・スタイル名を表示します。`/v1/speakers` とダウンロード状態を確認し、アプリを再起動してください。

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

### Style-Bert-VITS2

`@mekuru/speech/style-bert-vits2` の `<StyleBertVits2>` は Style-Bert-VITS2 の API サーバーで読み上げます。[Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) をインストーラーまたは [Python 環境の手順](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/CLI.md)で導入します。初期化前なら `python initialize.py` で必要なファイルと標準モデルを取得します。`model_assets/` 内の各モデルには重み・`config.json`・`style_vectors.npy` が必要です。

エンジンのフォルダで `python server_fastapi.py`（Windows は `Server.bat`）を起動します。モデル・話者（`spk2id`）・スタイル（`style2id`）は次で確認できます。例の `jvnv-F1-jp` はインストール済みのモデルに置き換え、モデルの利用規約に従ってください。

```sh
curl http://127.0.0.1:5000/models/info
```

声の設定（`StyleBertVits2Props`）:

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

`max-chars` の既定は `100` です。サーバーの `config.yml` の `server.limit` に合わせます。`language` 以外の省略した合成設定はサーバーの既定値を使います。値は `/docs` で確認できます。HTTP 422 の場合はモデル・言語・スタイル・話者・文字数制限を確認してください。

| エクスポート | 名前 | `model` |
| --- | --- | --- |
| `koharuneAmi` | 小春音アミ | `"koharune-ami"` |
| `amitaro` | あみたろ | `"amitaro"` |

### VoiSona Talk

`@mekuru/speech/voisona` の `<Voisona>` は VoiSona Talk の REST API で読み上げます。Windows・macOS で VoiSona Talk 1.3.7 以降にサインインし、ボイスライブラリを取得します。環境設定の「API」タブで API パスワードを設定し、「REST APIを有効にする」をオンにします（ポート `32766`）。アプリは起動したまま使います。[公式の設定手順](https://manual.voisona.com/ja/talk/pc/2b6e9bc7efb180ea86ccc6c7347e9ca6)。

Bun を動かすシェルで、サインインのメールアドレスと「API」タブのパスワードを設定します。

```sh
export MEKURU_VOISONA_USER='you@example.com'
export MEKURU_VOISONA_PASSWORD='your-api-password'
```

声・バージョン・言語は次で確認できます。curl に API パスワードを入力します。

```sh
curl --user "$MEKURU_VOISONA_USER" http://localhost:32766/api/talk/v1/voices
```

HTTP 401 はメールアドレスと API パスワードを確認してください。`localhost` で失敗する場合は `MEKURU_VOISONA_URL=http://127.0.0.1:32766` を指定します。例の `tanaka-san_ja_JP`（田中傘）は取得済みのライブラリに置き換え、その利用規約に従ってください。

声の設定（`VoisonaProps`）:

- `voice`: 必須: `"tanaka-san_ja_JP"` などのボイスライブラリ名、または `"田中傘"` などの表示名。表示名が重複する場合は `voice_name` を指定します。
- `version`: ボイスライブラリのバージョン。既定は選択した声のインストール済みの最新版。
- `language`: `"ja_JP"` などの言語コード。既定はその声の一覧の最初の言語。
- `speed`: API の単位での話す速さ。
- `pitch`: 声の高さの調整（セント）。
- `volume`: 合成時の音量（dB）。
- `alp`: 声質のパラメータ（`alp`）。
- `huskiness`: 声のかすれ具合。
- `intonation`: 抑揚の強さ。
- `style`: スタイル名と強さの辞書。`happy` がある声なら `{ happy: 0.5 }` など。指定しないスタイルはその声の既定の強さを使います。スタイル名と既定の強さは `/api/talk/v1/voices/<voice_name>/<voice_version>` の `style_names`・`default_style_weights` で確認できます。

省略した数値設定は API の既定値を使います。`url` に `/api/talk/v1` は含めません。

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

### テキストと時間

`<Voicevox>`・`<Coeiroink>`・`<StyleBertVits2>`・`<Voisona>` や `defineSpeech()` で作った部品など、どの読み上げ部品も声の設定のほかに次の属性（`SpeechProps`）を受け取ります。

- `text`: 必須: セリフ。文字列・数値・フラグメント・文字を返す部品。空の読み上げと、子を渡した場合はエラー。
- `name`: タイムラインの話者名。既定: 話者（どの属性かは[エンジン](#エンジン)の表を参照）。`prepare()` では `who`。
- `reading`: 読みの辞書。例: `{ Mekuru: "めくる" }`。長いキーを優先し、表示は変えない。
- `gap`: セリフの後の無音（フレーム）。既定: `Math.round(0.3 * fps)`（30 fps で9）。
- `gain-db`: 再生音量の調整（dB）。キャッシュする WAV は変えない。既定: 調整なし。
- `len`: 無音を含む全体のフレーム数。既定: 音声の長さを切り上げた値 + `gap`。話速は変えない。
- `id`・`at`: 生成する `<dur>` の識別名と開始時刻。[時間の属性](../../docs/reference/Syntax.jp.md#時間の属性)を参照。

`\n` は空白として読み、表示文字では改行になります。文字を返す同期・非同期の部品も使えます。ほかの要素は入れられません。セリフの連続再生は `<seq>`、字幕との同時表示は `<stack>`、口パクは[立ち絵の `Talk`](../narrator/README.jp.md) を使います。

### キャッシュとプレビュー

- 音声はエンジン・声の設定・読み上げテキストをキーに `.mekuru/cache/tts/` へ保存。キャッシュ済みならエンジン停止中も使用できます。
- 接続先や再生設定の変更では再合成しません。同名のモデルを更新した場合などは、該当する WAV を削除して再生成します。
- キャッシュがなければ、`writeXml()` は合成中に無音の下書きを出し、完了後に XML を更新します。動画の書き出し前に `await` してください。下書きの長さは1文字0.15秒と `gap` の合計（`len` 指定時はその値）です。下書きの外で呼ぶ `toXml()` は合成を待ちます。

### 共有する音声素材

`Voisona.prepare(props)`・`Voicevox.prepare(props)`・`Coeiroink.prepare(props)`・`StyleBertVits2.prepare(props)` は `PreparedLine` を返します。`text` と声・読み・長さの設定を渡し、`id`・`at` は返された素材を配置する側に付けます。`<mekuru>` 内の非同期部品で呼びます。独自のナレータでの使い方は[ナレータの組み立て](../narrator/README.jp.md)を参照してください。

- `line.audio`: 読み取り専用の `AudioSource`（型は `@mekuru/audio`）。`status` は `draft` または `ready`。`len` は句末の間を含むフレーム数、`label` と `volume` は再生時の設定。完成版の `src` は絶対パスです。
- `line.display`: 表示する文字列。`\n` で改行し、各行の前後の空白を除きます。文字コンポーネントは準備時に一度だけ展開します。
- `await subtitleText(text)`: `text` を展開し、`line.display` と同じ文字列を返します。音声なしでセリフを表示するときに使います。
- `<Audio source={line.audio} id="line" />`: 素材を既存の `<dur><audio /></dur>` に展開します。
- `readAudio(src, { gap?, len?, label?, volume? })`: 既存の WAV から同じ素材を作ります。`gap` の既定値は 0。相対パスは構築開始時のプロジェクトが基準です。

独自エンジンは `prepare()` で `{ audio, display }` を作り、`defineSpeech()` で JSX と `.prepare()` を提供します。

下書きでは見積もりの素材を返して合成を予約し、完成版では実際の WAV と長さを返します。どちらも同じ部品で表示できます。キャッシュ基準・進捗・実行中の合成は一回の構築に属し、import 時点の作業フォルダには依存しません。

### defineEngine(engine)

同梱のエンジンと同じく、HTTP API を持つエンジンの部品を作ります（例: [VOICEVOX](src/voicevox/index.tsx)）。

```tsx
import { defineEngine, type EngineProps } from "@mekuru/speech";

interface MySpeechProps extends EngineProps {
  speaker: number;
}

export const MySpeech = defineEngine<MySpeechProps>({
  kind: "my-engine",
  name: "My engine",
  defaultUrl: "http://127.0.0.1:8000",
  help: "  - start My engine",
  concurrency: 1,
  who: (props) => String(props.speaker),
  create: (call) => async (voice, text) =>
    (await call("/synthesis", { method: "POST", body: JSON.stringify({ ...voice, text }) })).arrayBuffer(),
});
```

- 属性は `EngineProps`（`SpeechProps` に `url` と `max-chars` を加えたもの）を拡張します。
- 接続先は `url` 属性、なければ `kind` から決まる環境変数 `MEKURU_<KIND>_URL`（この例では `MEKURU_MY_ENGINE_URL`）、なければ `defaultUrl` です。接続先ごとに `create(call, url)` で読み上げ関数を作り、同時に `concurrency` 本まで合成します。
- `call(path, init)` は接続先にリクエストを送ります（タイムアウトは5分）。接続できなければ `help` に続けて `url` や環境変数の設定方法と WSL2 から Windows の接続先へつなぐ方法を、HTTP エラーなら `name`・パス・ステータスをエラーに含めます。
- 読み上げ関数は `voice`（`SpeechProps` と `url` 以外の属性。キャッシュのキーにもなる）とテキストを受け取り、WAV のバイト列を返します。
- `max-chars` 属性（既定は `maxChars`。どちらもなければ制限なし）より長いセリフは、句読点の近くで分割して順に読み、結合します。
- `who(props)` は `name` を省略したときの話者名です。
- `cached(load)` は話者一覧など、読み上げ関数が接続先ごとに一度だけ読むものを保持します。読み込みに失敗したら次のセリフで読み直します。戻り値の関数に `true` を渡すと必ず読み直します。

### prepare(kind, props, who, voice, synthesize)

HTTP API を持たないエンジンは `prepare()` と `defineSpeech()` で部品にします。テキストと声の設定を受け取り、指定されたパスへ WAV を書き出し、保存が完了してから解決する関数を用意して、次のアダプターに渡します。

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

`"my-engine"` は自分のエンジンの識別名に置き換えます。`createSpeech()` が返す部品は `<mekuru>` 内に置きます。`defineSpeech()` は準備済みの音声を JSX（`<dur><audio /></dur>`）として返し、`writeXml()`・`toXml()` の展開中にフレームレートを参照します。

- `kind`: キャッシュのキーに使うエンジンの識別名。
- `props`: セリフと時間の設定を含む [`SpeechProps`](#テキストと時間)。
- `who`: `props.name` が省略されたときの話者名。
- `voice`: 合成する声を決めるシリアライズ可能な設定。キャッシュのキーに含みます。
- `synthesize`: `(text: string, output: string) => Promise<void>`。完成した WAV を `output` に書き出します。

キャッシュのキーは `kind`・`voice`・変換後のテキストです。`voice` に合成結果を決める設定を含め、接続先を変えても音声を再利用する場合は接続情報を除きます。

### 下書きを独自に扱う場合

`@mekuru/types` の `isDraft()`・`waitFor()` を使い、合成の Promise を登録します。下書きでは `<dur len={estimatedFrames}><audio draft label="..." /></dur>`、完成版では生成済みの `src` を持つ音声を返します。`label` がある音声はタイムラインの読み上げ行に出ます。`waitFor()` が完成版の更新を予約するのは `writeXml()` の中だけです。

`Audio` と `readAudio` は `@mekuru/audio`、`joinWavs(parts)` は `@mekuru/audio/wav` が提供します。`joinWavs` はフォーマットチャンクが同一の WAV バッファの空でない配列を連結します。リサンプリングや音声形式の変換は行いません。
