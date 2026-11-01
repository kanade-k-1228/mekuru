# @mekuru/viewer

[English](README.md)

React・Jotai・Vite で作られた、Mekuru Movie Maker のブラウザプレビューとタイムラインの UI です。非公開のワークスペースパッケージで、ビルド結果は [@mekuru/cli](../cli/README.jp.md) に同梱されます。

開発時は `mekuru-server` をポート 3333 で起動し、Bun 1.4 以上を使ってリポジトリのルートから実行します。

```sh
bun install
bun run --cwd pkgs/viewer dev
```

- `http://localhost:5173` を開きます。API と素材へのリクエストはポート 3333 に転送されます。
- `bun run --cwd pkgs/viewer build` で配布用の UI を `pkgs/cli/viewer/` に出力します。
- `src/view/` に UI、`src/logic/` に状態と計算の処理を置いています。

コンパイラの準備やサンプルの起動方法は [開発](../../docs/dev/Developer.jp.md) を参照してください。
