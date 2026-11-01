# @mekuru/core

[English](README.md)

Mekuru Movie Maker の台本を TSX で書き、XML に書き出すパッケージです。組み込み要素の型と、Hono の JSX ランタイムの再エクスポートを提供します。

Bun 1.4 以上が必要です。

```sh
bun add -d @mekuru/core
```

- `tsconfig.json` の `jsx` を `react-jsx`、`jsxImportSource` を `@mekuru/core` に設定します。
- `writeXml(path, video)` で部品を展開して XML を書き出し、`toXml(video)` で XML 文字列を取得できます。
- 非同期の読み上げ部品は、先に下書きを書き出し、音声合成が終わると更新できます。
- XML のプレビューと動画への書き出しには [@mekuru/cli](../cli/README.jp.md) を使います。

[TSX の書き方](../../docs/reference/Component.jp.md) と [組み込みの要素](../../docs/reference/Syntax.jp.md)
