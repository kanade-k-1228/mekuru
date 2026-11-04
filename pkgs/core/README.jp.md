# @mekuru/core

[English](README.md)

Mekuru Movie Maker の Rust 製動画コンパイラ兼プレビューサーバーです。XML の監視、コンパイル、HTTP/WebSocket・素材の配信、ブラウザ用ビューアを1つの実行ファイルにまとめています。ffmpeg による動画書き出しも行います。

TSX の型・JSX ランタイム・XML 出力は [@mekuru/types](../types/README.jp.md) が提供します。

```sh
bun add -d @mekuru/core
bunx mekuru-compiler .mekuru/main.xml --serve --run 'bun --hot src/main.tsx'
bunx mekuru-compiler .mekuru/main.xml -o video.mp4
```

OS 別バイナリは自動導入されます。npm コマンドはバイナリを選ぶ小さな Node/Bun ランチャーで、サーバーの処理はすべて Rust です。`@mekuru/core/compiler` の `findCompiler` は、`MEKURU_COMPILER`、OS 別 npm パッケージ、ローカルの新しい debug/release バイナリの順に探します。

実行ファイルをコピーすれば、Node・Bun・別のビューアフォルダなしで直接起動できます。

```sh
mekuru-compiler project/main.xml --serve --no-open
```

`--run` で TSX から XML を作る場合は、そのコマンドに Bun が必要です。動画書き出し・メディア解析には ffmpeg/ffprobe、文字表示には適切なフォントを用意してください。

## プレビューのオプション

- `--serve`: XML を監視し、ループバックでプレビューとタイムラインを配信します。
- `-p, --port <port>`: ポート。既定は3333、0なら空きポートを選びます。
- `--root <dir>`: 素材とスクリプトの基準フォルダ。既定は XML のフォルダ、`.mekuru` の場合はその親です。
- `--run <command>`: プロジェクトフォルダでシェルコマンドを実行します。標準エラーを次の XML 保存までビューアへ表示し、サーバー終了時は子プロセスも終了させます。
- `--no-open`: ブラウザを自動で開きません。`MEKURU_OPEN=0` でも同じです。

`--run` があれば XML がまだ存在しなくても起動できます。コンパイル失敗時は最後の成功シーンを維持します。保存後は10 ms間隔で2回読み、内容の一致を確認します。`/mnt/` では500 ms間隔のポーリングを使います。受信が遅れた WebSocket 接続には snapshot を送り直します。素材は HEAD・バイト範囲取得に対応し、プロジェクト外へ解決されるパスは配信しません。

## 書き出しのオプション

`--scale`・`--fps`・`--from`・`--to`・`--preset`・`--crf`・`--no-audio`・`--preview` で動画書き出しを設定します。

## ビルド

Rust 1.89 以上、C リンカー、UI ビルド用の Bun を使います。

```sh
bun install
bun run build:release
./target/release/mekuru-compiler path/to/main.xml --serve
```

ビューアを `pkgs/core/viewer/` にビルドし、`build.rs` で実行ファイルへ埋め込みます。UI 変更後は実行ファイルも再ビルドしてください。release ビルドは UI 未生成なら失敗し、Rust だけの debug ビルドでは作成手順を表示します。CI はすべての OS 別バイナリへ UI を埋め込んでから梱包します。

[XML構文](../../docs/reference/Syntax.jp.md)・[開発手順](../../docs/dev/Developer.jp.md)も参照してください。
