# サンプル: 最初の動画を作るチュートリアル

ずんだもん・四国めたんが話す短い動画を、新規プロジェクトから作る手順を解説します。各手順で、編集するファイル・入力するコード・確認する結果を順番に示します。

## 動画を見ながら作る

Bun、ffmpeg / ffprobe（libx264 付き）、日本語フォントを用意し、VOICEVOX を起動します。Windows の準備は [Windows 環境構築](../docs/install/Windows.md) を参照してください。

```sh
bun create @mekuru my-video
cd my-video
bun install
```

キャラクターの選択で VOICEVOX を展開し、ずんだもん・四国めたんを選びます。↑ / ↓ で移動、→ / ← で展開・折りたたみ、Space で選択、Enter で確定します。投稿先は YouTube・niconico を必要に応じて選びます。

同じ選択を引数で指定する場合は、最初のコマンドの代わりに次を使います。

```sh
bun create @mekuru my-video --voice zunda,metan --upload youtube,niconico --yes
```

| 手順          | 操作                                                          | 確認する結果                               |
| ------------- | ------------------------------------------------------------- | ------------------------------------------ |
| 01            | Bun・ffmpeg・ffprobe のバージョンを確認し、VOICEVOX を起動    | コマンドが実行できる                       |
| 02            | プロジェクトを作り、キャラクターと任意の投稿先を選択          | `my-video/` ができる                       |
| 03            | Tools の確認結果を読み、`cd my-video` → `bun install`         | 必要なパッケージが入る                     |
| 04            | エディタで `src/main.tsx` を開く                              | 選んだキャラクターの import がある         |
| 05            | 下記の最初の台本を入力して保存                                | 見出しと２人の会話が入る                   |
| 06            | `bun preview` を実行、Space で再生                            | 見出しを表示しながら順番に話す             |
| 07            | ずんだもんのセリフを長くして保存、確認後に戻す                | 合成後にタイムラインの長さが変わる         |
| 08            | 更新されないときはエラー・起動状態を確認                      | 修正して保存すると更新される               |
| 09            | `src/character/zunda.tsx` の Voicevox に `speed={1.1}` を追加 | ずんだもんの話す速さが変わる               |
| 10            | 背景の直後に `ZundaPortrait`・`MetanPortrait` を追加          | 左右に立ち絵が出る                         |
| 11            | 最初の `</stack>` の後に２つ目の場面を追加                    | 会話が終わると次の見出しに切り替わる       |
| 12            | 最初から最後まで再生                                          | 字幕・立ち絵・音声・場面の切り替わりを確認 |
| 13            | `bun run build`                                               | `video.mp4` ができ、プレイヤーで再生できる |
| 14–15（任意） | 投稿設定・初回の認証準備・投稿                                | 投稿先で動画と公開範囲を確認               |

### 最初の台本（手順 05）

生成された `src/main.tsx` を次の内容に置き換えます。

```tsx
import { writeXml } from "@mekuru/core";
import { Zunda, ZundaPortrait } from "./character/zunda";
import { Metan, MetanPortrait } from "./character/metan";

const Video = () => (
  <mekuru size="1920x1080" fps={30}>
    <rect w="100%" h="100%" fill="#141C26" />
    <stack>
      <text x="50%" y="35%" anchor="center" size={90}>
        はじめての動画
      </text>
      <seq>
        <Zunda>こんにちは、ずんだもんなのだ。</Zunda>
        <Metan>今日は Mekuru で動画を作るわ。</Metan>
      </seq>
    </stack>
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
```

### 完成形（手順 10–11）

[完成した台本](tutorial/main.tsx) を、新規プロジェクトの `src/main.tsx` にコピーできます。`src/character/` と `src/parts.tsx`、`assets/character/` は、ずんだもん・四国めたんを選んだときに生成されるものを使います。`tutorial/main.tsx` をこのリポジトリ内で直接実行するファイルではありません。

声の調整は別ファイルです。動画と同じにするには `src/character/zunda.tsx` の `<Voicevox>` に `speed={1.1}` を追加し、`src/parts.tsx` の `READING` に `TSX: "ティーエスエックス"` を追加します。生成された話者・字幕の設定はそのまま使います。

```sh
bun preview              # 保存しながら確認。http://localhost:3333
bun run typecheck        # 別のターミナルで型を確認
bun run build --preview  # 必要なら低解像度・15fps で試す
bun run build            # 最後に本番の video.mp4 を書き出す
```

`--preview` も同じ `video.mp4` を上書きします。投稿する前に、本番設定で書き出し直してください。投稿する場合は [動画の投稿](../docs/reference/Upload.md) に沿って初回の準備を済ませ、設定ファイルの内容を確認してから実行します。

## この解説動画自体を作る

解説動画は、[作者のチャンネル](https://www.youtube.com/c/kanade-k-1228)（ささらちゃんが電子工作する動画）と同じ作りです。

| 場面         | 作り                                                                           | 部品                                      |
| ------------ | ------------------------------------------------------------------------------ | ----------------------------------------- |
| いつもの画面 | 白い背景の左に図やコード、右に大きめの解説役（顔が画面の上のほう）             | `SasaraStand`・`Code`・`Terminal`・`Shot` |
| セリフ       | 赤い文字に白と赤の二重の縁取りの字幕。説明している所を赤い枠で囲む             | `Sasara`（`show`）・`Mark`・`CodeMark`    |
| 区切り       | ピンクの画面に傾けた大きな文字、効果音、大きな解説役（「ささらぼ！」など）     | `Jingle`                                  |
| 始めと終わり | 「はーい！ささらちゃんだよー！」で始め、「んじゃ、またねー！」で解説役が消える | `Exit`                                    |
| 最後の画面   | サムネイルと同じ構図（集中線・赤い大きな文字）                                 | `EndCard`                                 |

```text
example/
  src/main.tsx       解説動画の台本（導入・15 手順・まとめ）
  src/lesson.ts      画面に表示する最初の台本・追加するコード
  src/parts.tsx      解説役（読み上げ・動く立ち絵・字幕）・ジングル・コードやターミナルの表示・読み方の辞書
  tutorial/main.tsx  視聴者が作る動画の完成形（新規プロジェクト用）
  configs/          解説動画の投稿設定
  assets/           BGM・効果音・現行ビューアの画面・完成見本など（解説役の立ち絵はダウンロードして作る）
  scripts/          解説役の立ち絵をダウンロードして部品に分けるスクリプト
```

```sh
# VOICEVOX のアプリ、またはエンジンを起動
docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest

# リポジトリのルートで
bun install
bun run build
bun run --cwd example preview
bun run --cwd example build   # example/tutorial.mp4
```

新規プロジェクトの出力は `video.mp4`、この解説動画の出力は `tutorial.mp4` です。投稿設定もそれぞれのファイル名を指定します。

合成済みの音声は `.mekuru/` にキャッシュされます。新しいセリフや声の設定を変えたセリフには、音声エンジンが必要です。台本の表示例は `src/lesson.ts`、配布する完成形は `tutorial/main.tsx` にあり、変更時は両方を合わせてください。

解説役の口パク・表情・ポーズには [@mekuru/portrait](../docs/reference/Portrait.md) を使用しています。これは新規プロジェクトの静止画の立ち絵に追加した機能です。声は VOICEVOX の冥鳴ひまりです（`src/parts.tsx` の `voice`）。

## 解説役の立ち絵

[ささらちゃん立ち絵素材 v1.0](https://seiga.nicovideo.jp/seiga/im10852558)（しりんだーふれいる 様）を使っています。作者のチャンネルの動画と同じ立ち絵です。素材の PSD は再配布しないので、リポジトリには入っていません。`preview`・`build` の最初に `scripts/portrait.ts` が配布元からダウンロードして（約 51MB。`.mekuru/cache/portrait/` に保存）、YMM4 の動く立ち絵と同じ部品に分けます（`assets/character/sasara/`）。

```sh
cd example
bun run portrait   # 部品だけ作る。そろっていれば何もしない
```

- 衣装は通常衣装、メガネはピンク（`scripts/portrait.ts` の `GLASSES`。`null` でかけない）
- どの PSD のレイヤーをどの部品にするかは `scripts/portrait.ts` の `PARTS`。変えると次の実行で作り直す
- ポーズ（`体`）: 基本・指差し・指差し腰・指立て・指立て腰・考え・腕組み・バンザイ
- 表情の組み合わせは `src/parts.tsx` の `FACES`
- 利用規約は素材に同梱の `read me.txt` とキャラクターの公式ガイドラインに従ってください

## クレジット

- 音声: VOICEVOX:冥鳴ひまり
- 立ち絵: しりんだーふれいる 様（[im10852558](https://seiga.nicovideo.jp/seiga/im10852558)）
