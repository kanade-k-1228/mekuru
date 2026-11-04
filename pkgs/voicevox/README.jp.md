# @mekuru/voicevox

[English](README.md)

Mekuru Movie Maker のセリフを、VOICEVOX または API 互換のエンジンで読み上げる `Voicevox` 部品です。

## セットアップ

Windows・macOS・Linux で [VOICEVOX](https://voicevox.hiroshiba.jp/how_to_use/) を起動します。接続先は `http://127.0.0.1:50021`。話者・スタイルは `/speakers` で確認できます。[利用規約](https://voicevox.hiroshiba.jp/term/)とキャラクターの規約に従い、`VOICEVOX:ずんだもん` などのクレジットを記載してください。

Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・日本語フォントを用意し、プロジェクトに追加します。

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/voicevox
```

`tsconfig.json` に `jsx: "react-jsx"` と `jsxImportSource: "@mekuru/types"` を設定します。`bun create @mekuru` では設定済みです。

## 簡単な使い方

`src/main.tsx` に保存します。

```tsx
import { writeXml } from "@mekuru/types";
import { Voicevox } from "@mekuru/voicevox";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Voicevox speaker="ずんだもん/ノーマル">{text}</Voicevox>
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

`<Voicevox>` に渡すキャラクターごとの設定をエクスポートしています。展開して使い、ほかの props も追加できます。

```tsx
import { Voicevox, zunda } from "@mekuru/voicevox";

<Voicevox {...zunda}>こんにちは。</Voicevox>;
```

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

## 詳しい使い方

### 声の設定 (`VoicevoxProps`)

- `speaker`: 必須: 数値のスタイル ID、数字の文字列、または `"ずんだもん/ノーマル"` のような `"話者名/スタイル名"`。話者名だけなら最初のスタイルを選びます。
- `speed`: 話す速さ（`speedScale`）。
- `pitch`: 声の高さ（`pitchScale`）。エンジンの単位で指定します。
- `intonation`: 抑揚の強さ（`intonationScale`）。
- `volume`: 合成時の音量（`volumeScale`）。
- `pre`・`post`: 読み上げの前後の無音（秒）。
- `pause-scale`: 間の長さの倍率（`pauseLengthScale`）。
- `max-chars`: 1回の合成リクエストの最大文字数。長いセリフは句読点の近くで分割し、一つの WAV に結合します。既定は制限なし。
- `url`: エンジンのベース URL。既定は `http://127.0.0.1:50021`。

省略した合成設定は `/audio_query` の値を使います。互換エンジンは `url` に AivisSpeech の `http://127.0.0.1:10101`、SHAREVOX の `http://127.0.0.1:50025` を指定し、そのエンジンの `/speakers` から話者を選びます。

### テキスト・時間・キャッシュ

`<Voicevox>` は、どの読み上げ部品とも共通の[テキストと時間の属性](../speech/README.jp.md#テキストと時間)を受け取り、同じように[音声をキャッシュ](../speech/README.jp.md#キャッシュとプレビュー)します。`name` の既定は `speaker` です。

### 接続

接続先は `url` → `MEKURU_VOICEVOX_URL` → 既定 URL の順で決まります。Bun と同じ環境から確認します。

```sh
curl http://127.0.0.1:50021/speakers
```

接続できない場合は起動状態とポートを確認します。Windows のエンジンには [WSL の mirrored ネットワーク](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)で `127.0.0.1` から接続できます。

独自のナレータでは `await Voicevox.prepare({ ...声の設定, children })` で音声素材・表示文字・長さをまとめて取得できます。`id`・`at` は配置する部品に付けます。[共有する音声素材](../speech/README.jp.md#共有する音声素材)と[ナレータの組み立て](../narrator/README.jp.md)を参照してください。
