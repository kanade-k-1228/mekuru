# 最初の動画を作る

ずんだもん・四国めたんの会話を、新規プロジェクトで作ります。

## 動画を見ながら作る

[必要環境](../README.jp.md#必要なもの)を用意し、[VOICEVOX](../pkgs/voicevox/README.jp.md) を起動します。

```sh
bun create @mekuru my-video --voice zunda,metan --yes
cd my-video
bun install
```

対話で選ぶ場合は `--voice` と `--yes` を省略します。↑/↓ で移動、→/← で展開・折りたたみ、Space で選択、Enter で確定します。投稿先は `--upload youtube,niconico` で追加できます。

### 最初の台本（手順 05）

`src/main.tsx` を次に置き換えます。

```tsx
import { writeXml } from "@mekuru/core";
import { Zunda } from "./character/zunda";
import { Metan } from "./character/metan";

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

```sh
bun preview   # http://localhost:3333
```

Space で再生します。セリフを長くして保存すると、合成後に場面の長さも変わります。更新されない場合はブラウザのエラーと VOICEVOX の起動状態を確認してください。

### 完成形（手順 10–11）

[完成した台本](tutorial/main.tsx) を、新規プロジェクトの `src/main.tsx` にコピーします。`src/character/`・`src/parts.tsx`・`assets/character/` は生成されたものを使います。`tutorial/main.tsx` は新規プロジェクト用で、このリポジトリから直接実行するファイルではありません。

- 話速: `src/character/zunda.tsx` の `<Voicevox>` に `speed={1.1}`
- 読み方: `src/parts.tsx` の `READING` に `TSX: "ティーエスエックス"`
- 立ち絵・次の場面: 完成形の `ZundaPortrait`・`MetanPortrait` と2つ目の `<stack>`

プレビューで音声・字幕・立ち絵・場面の切り替えを確認し、別のターミナルで書き出します。

```sh
bun run typecheck
bun run build --preview   # 半分の解像度・15 fps
bun run build             # 通常の設定で video.mp4 を出力
```

両ビルドは同じ `video.mp4` を上書きします。投稿前に通常の設定で書き出してください。投稿の準備は [YouTube・ニコニコ動画](../docs/reference/Upload.jp.md) を参照してください。

## この解説動画自体を作る

リポジトリの `example/` は、上の手順を説明する動画です。解説役は VOICEVOX の冥鳴ひまりで、[動く立ち絵](../docs/reference/Portrait.jp.md)を使います。

- [src/main.tsx](src/main.tsx): 解説動画の台本
- [src/lesson.ts](src/lesson.ts): 画面に表示するコード
- [src/parts.tsx](src/parts.tsx): セリフ・字幕・立ち絵・ジングル・強調枠
- [tutorial/main.tsx](tutorial/main.tsx): 視聴者が作る台本の完成形
- `configs/`: 投稿設定
- `assets/`: BGM・効果音・画像

VOICEVOX を起動し、リポジトリのルートで実行します。

```sh
bun install
bun run build
bun run --cwd example preview
bun run --cwd example build   # example/tutorial.mp4
```

表示するコードを変えた場合は `src/lesson.ts` と `tutorial/main.tsx` を揃えます。投稿設定の動画名は `tutorial.mp4` です。

## 解説役の立ち絵

[ささらちゃん立ち絵素材 v1.0](https://seiga.nicovideo.jp/seiga/im10852558)（しりんだーふれいる 様）を使います。PSD は再配布せず、`preview`・`build` の開始時に `scripts/portrait.ts` が取得し、部品へ変換します。

- キャッシュ: `.mekuru/cache/portrait/`（ダウンロードは約51MB）
- 出力: `assets/character/sasara/`
- 部品だけを作る: `bun run --cwd example portrait`
- 衣装・メガネ・部品の対応: `scripts/portrait.ts` の `GLASSES`・`PARTS`。`GLASSES: null` でメガネなし。変更時は次回実行で再生成
- 表情: `src/parts.tsx` の `FACES`

素材に同梱の `read me.txt` とキャラクターの公式ガイドラインに従ってください。

## クレジット

- 音声: VOICEVOX:冥鳴ひまり
- 立ち絵: しりんだーふれいる 様（[im10852558](https://seiga.nicovideo.jp/seiga/im10852558)）
