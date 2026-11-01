# @mekuru/niconico

[English](README.md)

Playwright で投稿ページに入力し、Mekuru Movie Maker の動画をニコニコ動画に投稿します。動画のパス、タイトル、説明文、タグ、任意のサムネイルを YAML から読み込みます。

Bun 1.4 以上と Chromium が必要です。`configs/niconico.yaml` を準備し、プロジェクトのフォルダから実行します。

```sh
bun add -d @mekuru/niconico
bunx playwright-core install chromium
bunx mekuru-niconico login
bunx mekuru-niconico --check
```

- `login` でログイン状態を保存します。`--check` はブラウザの窓で入力まで行い、最後の投稿操作は手動で行います。
- `bunx mekuru-niconico` で自動投稿します。`--headed` を付けるとブラウザの窓を表示します。
- 既定の設定ファイルは `configs/niconico.yaml` です。引数に別の YAML のパスを渡せます。設定内のファイルパスはプロジェクトのフォルダからの相対パスです。
- インストール済みの Chrome・Chromium を使う場合は、`MEKURU_BROWSER` に実行ファイルのパスを指定します。

[設定例](../../example/configs/niconico.yaml) と [投稿ガイド](../../docs/reference/Upload.jp.md)
