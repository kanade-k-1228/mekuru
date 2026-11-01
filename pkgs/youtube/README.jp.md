# @mekuru/youtube

[English](README.md)

Mekuru Movie Maker の動画を YouTube にアップロードします。動画のパス、タイトル、説明文、タグ、公開設定、任意のサムネイルを YAML で指定します。Bun 1.4 以上が必要です。

[投稿ガイド](../../docs/reference/Upload.jp.md) に従って `configs/youtube.yaml` と OAuth クライアントの設定を準備し、プロジェクトのフォルダから実行します。

```sh
bun add -d @mekuru/youtube
bunx mekuru-youtube --dry-run
bunx mekuru-youtube
```

- 既定の設定ファイルは `configs/youtube.yaml` です。引数に別の YAML のパスを渡せます。複数渡すと順にアップロードします。
- 設定内のファイルパスはプロジェクトのフォルダからの相対パスです。
- `--dry-run` はログインやアップロードをせずに設定を表示します。初回のアップロードでは Google にログインするためのブラウザが開きます。

[設定例](../../example/configs/youtube.yaml)
