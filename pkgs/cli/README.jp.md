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

コンパイラは `MEKURU_COMPILER` → OS 別 npm パッケージ → 更新日時が新しい `target/debug`・`target/release` の順で探します（同時刻なら debug）。`@mekuru/cli/protocol` はサーバーとビューアの共有型です。

[TSX の作業手順](../../docs/reference/Component.jp.md)・[開発](../../docs/dev/Developer.jp.md)
