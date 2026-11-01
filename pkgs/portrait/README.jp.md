# @mekuru/portrait

[English](README.md)

Mekuru Movie Maker の動く立ち絵です。ゆっくりMovieMaker4 の「動く立ち絵」形式の画像部品を重ね、まばたき、表情の切り替え、声の大きさに合わせた口パクを行います。

Bun 1.4 以上、[@mekuru/core](../core/README.jp.md)、立ち絵の画像部品を入れたフォルダが必要です。

```sh
bun add -d @mekuru/core @mekuru/portrait
```

- `@mekuru/portrait` から `portrait` を import し、`portrait({ src, ...options })` にプロジェクトのフォルダからの相対パスを渡します。
- 戻り値の `Stand` は待機中の立ち絵を表示します。`Talk` は読み上げ部品または音声要素を一つ包み、再生中の立ち絵を動かします。
- `face`・`faces` で表情を定義し、`x`・`y`・`w`・`h`・`z` で配置を指定できます。

画像フォルダの構成と使用例は [立ち絵](../../docs/reference/Portrait.jp.md) を参照してください。
