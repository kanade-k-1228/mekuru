# @mekuru/create

[English](README.md)

TSX の台本・キャラクター部品・プレビューとビルドのコマンドを備えたプロジェクトを作成します。Bun 1.4 以上が必要です。

```sh
bun create @mekuru my-video --voice zunda,metan
cd my-video
bun install
```

端末では未指定の項目を対話で選びます。作成後に ffmpeg と選択した音声合成エンジンを確認します。

- `--voice <names>`: キャラクター名またはエンジン名をカンマ区切りで指定。エンジン名は所属する全キャラクターを選択。既定: なし。
- `--upload <sites>`: `youtube,niconico` の投稿コマンドと YAML 設定を追加。既定: なし。
- `--yes`: 対話せず既定値を使用。端末以外からの実行も同様。
- `--force`: 空でないフォルダへの作成を許可。
- `--mekuru <spec>`: 使用する Mekuru パッケージのバージョン指定。

[チュートリアル](../../example/README.md)・[プロジェクト構成と作業手順](../../docs/reference/Component.jp.md)
