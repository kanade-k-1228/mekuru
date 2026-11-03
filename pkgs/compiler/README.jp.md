# @mekuru/compiler

[English](README.md)

Mekuru Movie Maker の Rust 製動画コンパイラ兼プレビューサーバーです。XML の監視、コンパイル、HTTP/WebSocket・素材の配信、ブラウザ用ビューアを1つの実行ファイルにまとめています。ffmpeg による動画書き出しも行います。

```sh
bun add -d @mekuru/compiler
bunx mekuru-compiler .mekuru/main.xml --serve --run 'bun --hot src/main.tsx'
bunx mekuru-compiler .mekuru/main.xml -o video.mp4
```

`@mekuru/cli` を `@mekuru/compiler` に統合しました。依存名と `@mekuru/cli/timeline` などの import を `@mekuru/compiler/timeline` へ変更してください。OS 別バイナリは自動導入されます。npm コマンドにはバイナリ選択用の小さな Node/Bun ランチャーだけを残し、サーバーの処理はすべて Rust です。`mekuru-server <xml>` は `mekuru-compiler <xml> --serve` の別名として使えます。JavaScript の旧 `startServer` API は廃止し、ネイティブコマンドの起動または Rust の `mekuru_compiler::server::start` を利用します。

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
- `--title <name>`: ブラウザのタイトル。既定は XML の引数です。
- `--no-open` / `--open`: ブラウザの自動起動。`MEKURU_OPEN=0`・`false`・`no`・`off` でも抑止できます。

`--run` があれば XML がまだ存在しなくても起動できます。コンパイル失敗時は最後の成功シーンを維持します。保存後は10 ms間隔で2回読み、内容の一致を確認します。`/mnt/` では500 ms間隔のポーリングを使います。受信が遅れた WebSocket 接続には snapshot を送り直します。素材は HEAD・バイト範囲取得に対応し、プロジェクト外へ解決されるパスは配信しません。

## 書き出し・機械向け出力

- `--scale`・`--fps`・`--from`・`--to`・`--preset`・`--crf`・`--no-audio`・`--preview` で動画書き出しを設定します。
- `--emit-preview`: 展開済みのプレビュー JSON を出力します。
- `--emit-timeline`: 描画パスを含めず、台本 ID・整数フレーム区間・繰り返し・診断を出力します。
- `--preview-worker`: ツールと計測用に JSON Lines 接続を維持します。ネイティブサーバーはコンパイラを同一プロセス内で呼び出し、IPC を使いません。

## 公開APIと軽量タイムライン

Bun の台本用アダプターと型は `@mekuru/compiler/timeline` から利用できます。

```ts
import { compileTimeline, timelineIntervals } from "@mekuru/compiler/timeline";
const result = await compileTimeline(".mekuru/main.xml");
for (const entry of result.timeline?.entries ?? []) {
  console.log(entry.sourceId, timelineIntervals(entry));
}
```

`compileTimeline(xmlPath, { root? })` は `{ timeline, diagnostics }` を返し、解析失敗時は timeline が null です。`timelineIntervals` は入れ子の繰り返しを展開し、最終周回を切り詰めた論理区間を返します。スロットによる表示区間とは別です。`@mekuru/compiler/compiler` の `findCompiler` は、`MEKURU_COMPILER`、OS 別 npm パッケージ、ローカルの新しい debug/release バイナリの順に探します。

## ビルド

Rust 1.89 以上、C リンカー、UI ビルド用の Bun を使います。

```sh
bun install
bun run build:release
./target/release/mekuru-compiler path/to/main.xml --serve
```

ビューアを `pkgs/compiler/viewer/` にビルドし、`build.rs` で実行ファイルへ埋め込みます。UI 変更後は実行ファイルも再ビルドしてください。release ビルドは UI 未生成なら失敗し、Rust だけの debug ビルドでは作成手順を表示します。CI はすべての OS 別バイナリへ UI を埋め込んでから梱包します。

[XML構文](../../docs/reference/Syntax.jp.md)・[開発手順](../../docs/dev/Developer.jp.md)も参照してください。
