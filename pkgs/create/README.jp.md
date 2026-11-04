# @mekuru/create

[English](README.md)

VOICEVOX サンプルか空の台本を選び、プレビューとビルドのコマンドを備えたプロジェクトを作成します。Bun 1.4 以上が必要です。

```sh
bun create @mekuru my-video
cd my-video
bun install
bun run voicevox # 別のターミナルで起動したままにする（Docker が必要）
bun preview
```

端末ではフォルダ・テンプレート・投稿先の未指定項目を対話で選びます。作成後に ffmpeg を確認します。

- **VOICEVOX sample（既定）**: 音声付きサンプル・音声パッケージ・`bun run voicevox` を含みます。起動コマンドは Docker で CPU 版サーバーを `http://127.0.0.1:50021` に公開します。初回はイメージを取得し、Ctrl+C で終了します。VOICEVOX アプリを起動する方法でも構いません。他のエンジンへの変更は [音声合成の説明](../speech/README.jp.md) を参照してください。
- **Empty project**: 空の `src/main.tsx` と最小限の依存を含みます。音声パッケージやサーバー起動コマンドは含みません。

```sh
bun create @mekuru my-video --template empty --yes
```

- `--template <template>`: `sample` または `empty`。既定: `sample`。
- `--upload <sites>`: `youtube,niconico` の投稿コマンドと YAML 設定を追加。既定: なし。
- `--yes`: 対話せず既定値を使用。端末以外からの実行も同様。
- `--force`: 空でないフォルダへの作成を許可。

[チュートリアル](../../example/README.md)・[プロジェクト構成と作業手順](../../docs/reference/Component.jp.md)
