# @mekuru/upload

[English](README.md)

Mekuru Movie Maker の動画を YouTube とニコニコ動画に投稿します。動画のパス、タイトル、説明文、タグ、任意のサムネイルを YAML で指定します。Bun 1.4 以上が必要です。

```sh
bun add -d @mekuru/upload
```

コマンドはプロジェクトのフォルダから実行します。設定内のファイルパスはそこからの相対パスです。既定の設定ファイルは `configs/youtube.yaml`・`configs/niconico.yaml` です。引数に別の YAML のパスを渡せます。複数渡すと順に投稿します。

## YouTube

[投稿ガイド](../../docs/reference/Upload.jp.md#youtube) に従って `configs/youtube.yaml` と OAuth クライアントの設定を準備し、次を実行します。

```sh
bunx mekuru-youtube --dry-run   # ログインや投稿をせずに設定を表示
bunx mekuru-youtube             # 初回は Google にログインするためのブラウザが開く
```

## ニコニコ動画

`mekuru-niconico` は Playwright で投稿ページに入力するため、Chromium が必要です。`configs/niconico.yaml` を準備し、次を実行します。

```sh
bunx playwright-core install chromium
bunx mekuru-niconico login      # ログイン状態を保存
bunx mekuru-niconico --check    # ブラウザの窓で入力まで行い、投稿操作は手動
bunx mekuru-niconico            # 自動で投稿。--headed でブラウザの窓を表示
```

インストール済みの Chrome・Chromium を使う場合は、`MEKURU_BROWSER` に実行ファイルのパスを指定します。

設定例: [YouTube](../../example/configs/youtube.yaml)・[ニコニコ動画](../../example/configs/niconico.yaml)
