# @mekuru/cli

[English](README.md)

プレビューと動画書き出しのコマンドです。Bun 1.4 以上・ffmpeg・ffprobe・台本の文字に対応したフォントが必要です。

```sh
bun add -d @mekuru/cli
bunx mekuru-server .mekuru/main.xml --run 'bun --hot src/main.tsx'
bunx mekuru-compiler .mekuru/main.xml -o video.mp4
```

- `mekuru-server <xml>`: XML を監視してブラウザのビューアを起動。
- `--run <cmd>`: XML を生成するコマンドを起動。
- `--port`, `--title`: ポート（既定: 3333）とブラウザのタイトル。
- `--no-open`, `--open`: ブラウザの自動起動。既定は開く。`MEKURU_OPEN=0` で抑止。
- `mekuru-compiler <xml>`: ネイティブコンパイラで動画を書き出す。
- `-o <file>`: 出力ファイル。
- `--preview`: 半分の解像度・15 fps。
- `--scale`, `--fps`: 解像度の倍率とフレームレート。
- `--from`, `--to`: 書き出す範囲（秒）。
- `--preset`, `--crf`: x264 のエンコード設定。
- `--no-audio`: 音声なしで書き出す。

両コマンドの `--root <dir>` で素材の基準フォルダを指定できます。既定は XML のあるフォルダ（`.mekuru/` ならその親）です。

コンパイラは `MEKURU_COMPILER` → OS 別 npm パッケージ → 更新日時が新しい `target/debug`・`target/release` の順で探します（同時刻なら debug）。`@mekuru/protocol` はサーバーとビューアの共有型です。

[TSX の作業手順](../../docs/reference/Component.jp.md)・[開発](../../docs/dev/Developer.jp.md)

## 公開APIと軽量タイムライン

`findCompiler` は `@mekuru/cli/compiler`、`startServer` は
`@mekuru/cli/server` からimportできます。通常の起動には既存コマンドを使います。
`@mekuru/cli/timeline` の `compileTimeline(xmlPath, { root? })` は
`{ timeline, diagnostics }` を返します。コンパイル診断による失敗はtimelineがnull、
起動・応答の異常は例外です。

`--emit-timeline` は配置と素材情報取得までを実行し、文字パス生成・PCM生成・
動画書き出しを省きます。時間は整数フレームの半開区間、fpsは `{ num, den }`。
`sourceId` は台本のID、`id` はコンパイル内だけの識別子です。
IDはrepeatの時計ごとに一意です。`timelineIntervals(entry)` で必要な要素だけを
絶対区間へ展開できます。slotや透明度による可視区間の計算は行いません。
下書き音声を含む場合は `estimated: true` です。

SSEは描画本体の `preview` と状態だけの `state` に分かれます。開始・失敗時は
以前の描画データを再送しません。compiler・CLI・viewerは同時に更新してください。
[npm導入のFFmpeg設定とAPIの利用例](README.md#programmatic-apis)を参照してください。
