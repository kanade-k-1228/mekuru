# Mekuru Movie Maker の使い方

VOICEVOX のずんだもんが、プロジェクト作成から書き出しまでを案内する example 動画です。立ち絵は、画像生成スキルで作った SD（スーパーデフォルメ）イラストをまとめたシンプルな PSD を使います。

## example 動画を作る

リポジトリ直下で `bun install` を実行し、Bun 1.4 以上、libx264 付き ffmpeg・ffprobe、日本語フォントを用意します。コンパイラは `bun run build` でビルドできます。

VOICEVOX を起動します。既定の接続先は `http://127.0.0.1:50021`、音声は「ずんだもん / ノーマル」です。別の接続先は `MEKURU_VOICEVOX_URL` で指定できます。

Docker が使える場合は、次のコマンドで CPU 版のサーバーを起動できます。初回はイメージをダウンロードします。起動したターミナルはそのままにして、別のターミナルで `preview`・`build` を実行します。終了は Ctrl+C です。

```sh
bun run --cwd example voicevox
```

```sh
bun run --cwd example preview
bun run --cwd example build
```

`preview`・`build` は先に PSD を展開します。書き出し先は `example/tutorial.mp4` です。

### VS Code 内で音声が聞こえない場合

VS Code の内蔵動画プレビューは [MP4 の AAC 音声に非対応](https://github.com/microsoft/vscode/blob/main/extensions/media-preview/README.md)です。`tutorial.mp4` のナレーションを確認するには、外部の動画プレーヤーで開くか、`bun run preview` のブラウザー画面を使います。

VS Code 内で確認する場合は、`build` 後に次を実行して `tutorial.vscode.mp4` を開きます。映像をコピーし、音声のみ MP3 に変換します（libmp3lame 付き ffmpeg が必要）。通常の書き出し・投稿には `tutorial.mp4` を使います。

```sh
bun run --cwd example export:vscode
```

## 動画内のサンプル

```sh
bun create @mekuru my-video --engine voicevox
```

まず、このリポジトリの直下で `bun run --cwd example portrait` を実行して、PSD から PNG を展開します。その後、作ったプロジェクトに [tutorial/character/zundamon.tsx](tutorial/character/zundamon.tsx) を `src/character/zundamon.tsx`、[tutorial/assets](tutorial/assets) の内容を `assets` としてコピーします。[tutorial/main.tsx](tutorial/main.tsx) は完成時の台本です。`src/parts.tsx` は作成時のものを使います。

PSD・メタデータ・型を Git 管理し、展開後の PNG は `.gitignore` で除外しています。PSD を編集したら、作成したプロジェクトで再展開します。

```sh
bun x mekuru-psd assets/source/zundamon.psd --out assets/character/zundamon
```

## 自作の立ち絵 PSD

元データは [tutorial/assets/source/zundamon.psd](tutorial/assets/source/zundamon.psd)。600 × 900 px、透明背景、8-bit RGB、通常合成のラスターレイヤです。上から次の順に重なります。

```text
zundamon.psd
└─ face [select]
   ├─ smug       ドヤ顔
   ├─ worry      困り顔
   ├─ surprise   驚き
   ├─ wink       ウインク
   ├─ smile      笑顔
   └─ normal     通常（初期表示）
```

`portrait()` の `face` で6種類の表情を指定します。`face [select]` グループの各選択肢は全身イラストで、目や口を個別に描き直さずに切り替えるシンプルな構成です。example では台詞ごとに表情を切り替えます。自動まばたき・音量に合わせた口パクはありません。

```tsx
<ZundamonPortrait x="85%" h="45%" face="wink" />
```

example の素材を再展開するには、リポジトリ直下で実行します。

```sh
bun run --cwd example portrait
# 同じレイヤ名・選択肢を持つ別の PSD を使う場合
bun run --cwd example portrait /path/to/zundamon.psd
```

[元イラスト](tutorial/assets/source/zundamon-sd-sheet.png) は内蔵 `image_gen` で生成した透明背景の6表情シートです。[使用プロンプト](tutorial/assets/source/zundamon-sd-prompts.json) を同梱しています。[PSD作成スクリプト](scripts/create-portrait.ts) はシートを表情ごとに分割し、位置と大きさをそろえてPSDにまとめます。

`bun run --cwd example portrait:source` は元の PSD を上書きします。普段の `portrait`・`preview`・`build` は PSD を読み込むだけなので、画像編集ソフトで加えた変更を保ちます。

## クレジット

- 音声: VOICEVOX:ずんだもん
- 立ち絵: SDずんだもん（内蔵 image_gen による画像生成・自作PSD。既存の配布立ち絵は使用していません）
- キャラクター: [東北ずん子・ずんだもんプロジェクト](https://zunko.jp/)
