# mekuru-compiler

[English](README.md)

Mekuru Movie Maker の Rust 製コンパイラです。[@mekuru/core](../core/README.jp.md) が生成した XML を読み、時間と配置の計算、フレームの描画、音声の合成、ffmpeg による動画の書き出しを行います。

ビルドには Rust 1.89 以上と C リンカが必要です。動画の書き出しには libx264 付きの ffmpeg・ffprobe と表示する文字に対応したフォントを使います。

リポジトリのルートから実行します。

```sh
cargo build -p mekuru-compiler --release --locked
./target/release/mekuru-compiler path/to/main.xml -o video.mp4
```

- `--emit-preview` でブラウザのビューア向けの JSON を出力します。
- `--scale`・`--fps`・`--from`・`--to` で出力サイズ、フレームレート、時間範囲を指定できます。
- 公開パッケージを使うプロジェクトでは、通常 [@mekuru/cli](../cli/README.jp.md) 経由で起動します。

[XML の構文](../../docs/reference/Syntax.jp.md) と [開発](../../docs/dev/Developer.jp.md)
