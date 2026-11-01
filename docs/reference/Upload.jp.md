# 動画の投稿

[English](Upload.jp.md)

投稿先のコマンドが YAML 設定を読み、動画をアップロードします。設定内のパスはプロジェクトのフォルダ（`package.json` の場所）を基準にします。

## セットアップ

`bun create @mekuru --upload youtube,niconico` で投稿コマンドと `configs/` を生成できます。既存のプロジェクトには [@mekuru/youtube](../../pkgs/youtube/README.jp.md)・[@mekuru/niconico](../../pkgs/niconico/README.jp.md) を追加します。

- YouTube: `mekuru-youtube`。既定の設定は `configs/youtube.yaml`。
- ニコニコ動画: `mekuru-niconico`。既定の設定は `configs/niconico.yaml`。

生成プロジェクトでは `bun run upload:youtube`・`bun run upload:niconico` で呼び出せます。設定例は [YouTube](../../example/configs/youtube.yaml)・[ニコニコ動画](../../example/configs/niconico.yaml) を参照してください。

## 設定

- `video`: 動画のパス。既定: `video.mp4`
- `title`: タイトル。必須
- `description`: 説明文。複数行の文字列または行の配列
- `tags`: タグの配列
- `thumbnail`: 任意のサムネイル。例: `configs/thumbnail.png`

```yaml
# configs/youtube.yaml
video: video.mp4
title: はじめての動画
description: |
  Mekuru で作った動画です。
tags: [Mekuru]
privacy: private
```

### 複数のパターン

設定ファイルを分けて引数に指定します。複数渡すと順に投稿します。

```sh
bun run upload:youtube configs/youtube.yaml configs/youtube-short.yaml
```

## YouTube

### 初回の認証

1. [Google Cloud](https://console.cloud.google.com/) でプロジェクトを作り、YouTube Data API v3 を有効にします。
2. OAuth 同意画面を設定し、自分の Google アカウントをテストユーザーに追加します。
3. デスクトップアプリ用の OAuth クライアント ID を作り、JSON を `~/.config/mekuru/youtube-client.json` に保存します。
4. 初回の投稿で開くブラウザからログインします。

認証情報の保存先は Windows では `%APPDATA%\mekuru\`、変更する場合は `MEKURU_CONFIG_DIR` を指定します。ログインは `youtube-token.json` に保存され、削除するとアカウントを切り替えられます。

```sh
bun run upload:youtube --dry-run   # 設定を確認。ログイン・投稿はしない
bun run upload:youtube             # 投稿して URL を表示
```

### 追加設定と制限

- `category`: カテゴリ ID。既定: 22（ブログ）。27: 教育、28: 科学と技術
- `privacy`: `private`（既定）・`unlisted`・`public`
- `publishAt`: 公開日時。例: `2026-11-01T18:00:00+09:00`。`privacy: private` と併用
- `madeForKids`: 子ども向けか。省略時はチャンネルの既定

タイトルは100文字、説明は5000バイト、タグは合計500文字まで。タイトル・説明に `<`・`>` は使えません。サムネイルは JPEG・PNG、2MB までで、チャンネルがカスタムサムネイルに対応している必要があります。

API プロジェクトの監査状況によっては非公開になります。投稿後に YouTube Studio で公開状態を確認してください。OAuth のテスト設定ではログインの有効期限が短くなり、投稿回数には API のクォータが適用されます。

## ニコニコ動画

### 初回の準備

```sh
bunx playwright-core install chromium
bunx mekuru-niconico login
bun run upload:niconico --check
```

既存の Chrome・Chromium を使う場合は `MEKURU_BROWSER` に実行ファイルのパスを指定します。ログインは `~/.config/mekuru/niconico-browser/`（Windows は `%APPDATA%\mekuru\niconico-browser\`）に保存します。アカウントの切り替えはこのフォルダを削除してログインし直します。

### 投稿

`--check` はブラウザで入力まで行い、投稿ボタンは手動で押します。`bun run upload:niconico` は自動投稿、`--headed` を付けるとブラウザの窓を表示します。

Playwright で投稿ページを操作するため、ページの変更で動作しなくなる場合があります。失敗時は `.mekuru/niconico-error.png` と手動投稿用の内容を出力します。
