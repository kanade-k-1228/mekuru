# 動画の投稿

- `bun create mekuru-app` でアップロード先を選ぶと、`upload:<先>` のスクリプトと設定のファイル（`configs/youtube.yaml`・`configs/niconico.yaml`）が入る（引数では `--upload youtube,niconico`）
- あとから加えるときは `bun add -d @mekuru/youtube` などと、下のスクリプト・設定のファイルを書く
- 設定のファイルとサムネイルは `configs/` に置く。設定の中のパスは、プロジェクトのフォルダ（`package.json` と同じ所）から書く

- 例は example の設定（[`example/configs/`](../../example/configs/)。動画は `tutorial.mp4`）

```jsonc
// example/package.json（抜粋）
"scripts": {
  …
  "upload:youtube": "mekuru-youtube",
  "upload:niconico": "mekuru-niconico"
},
```

```yaml
# example/configs/youtube.yaml
video: tutorial.mp4
title: "Mekuru Movie Maker 入門: 最初の動画を作るチュートリアル"
description: |
  Mekuru Movie Maker で最初の動画を作る手順を、ずんだもん・四国めたんと一緒に進めます。
  プロジェクトの作成、台本の編集、プレビュー、声と立ち絵の調整、書き出し、任意の投稿まで。
  手順と完成した台本: https://github.com/kanade-k-1228/sasara/tree/main/example

  音声: VOICEVOX:ずんだもん / VOICEVOX:四国めたん
tags: [MekuruMovieMaker, VOICEVOX, 解説動画]
category: 28 # 科学と技術
privacy: private
```

```yaml
# example/configs/niconico.yaml
video: tutorial.mp4
title: "Mekuru Movie Maker 入門: 最初の動画を作るチュートリアル"
description: |
  Mekuru Movie Maker で最初の動画を作る手順を、ずんだもん・四国めたんと一緒に進めます。
  プロジェクトの作成、台本の編集、プレビュー、声と立ち絵の調整、書き出し、任意の投稿まで。
  手順と完成した台本: https://github.com/kanade-k-1228/sasara/tree/main/example

  音声: VOICEVOX:ずんだもん / VOICEVOX:四国めたん
tags: [MekuruMovieMaker, VOICEVOX, 解説動画]
```

- サムネイルを付けるときは、画像を `configs/` に置いて `thumbnail: configs/thumbnail.png` のように書く

## 複数のパターン

- パターンごとに設定のファイルを増やす（`configs/youtube-short.yaml` など）。動画もパターンごとに `video` で選べる
- 引数に設定のファイルを渡すと、それで投稿する。いくつも並べると順に投稿する

```
$ bun run upload:youtube                                   # configs/youtube.yaml
$ bun run upload:youtube configs/youtube-short.yaml        # 別のパターン
$ bun run upload:youtube configs/youtube.yaml configs/youtube-short.yaml
```

## YouTube

```
$ bun run upload:youtube             # アップロードして URL を表示する
$ bun run upload:youtube --dry-run   # 送る内容を表示するだけ
```

### 設定

- `video`: 動画のファイル（既定 `video.mp4`）
- `title`（必須）: タイトル（100 文字まで）
- `description`: 説明文。複数行は `|` の次の行から字下げして書く（行の配列でもよい。5000 バイトまで）
- `tags`: タグの配列（合わせて 500 文字まで）
- `category`: カテゴリの ID（既定 22: ブログ。27: 教育、28: 科学と技術）
- `privacy`: `private`（既定）・`unlisted`・`public`
- `publishAt`: 公開する日時（`2026-11-01T18:00:00+09:00` など。`privacy` は `private`）
- `madeForKids`: 子ども向けか（省くとチャンネルの既定）
- `thumbnail`: サムネイルの画像（JPEG・PNG。2MB まで）
- タイトルと説明文に `<`・`>` は使えない

### 準備（初回だけ）

1. [Google Cloud](https://console.cloud.google.com/) でプロジェクトを作り、YouTube Data API v3 を有効にする
2. OAuth 同意画面を作り、自分の Google アカウントをテストユーザーに加える
3. OAuth クライアント ID（種類: デスクトップ アプリ）を作り、その JSON を `~/.config/mekuru/youtube-client.json` に保存する（Windows は `%APPDATA%\mekuru\`）
4. 初めてのアップロードでブラウザが開くので、ログインして許可する（以降は `youtube-token.json` に保存したログインを使う）

### 注意

- 審査（監査）を通していない API プロジェクトからの動画は、`privacy` によらず非公開になる。YouTube Studio で公開に切り替える
- 同意画面が「テスト」のままだと、ログインは 7 日で切れる。切れたら次のアップロードでブラウザが開く
- アップロードできる回数には、1 日の上限（クォータ）がある
- カスタムサムネイルは、それが使えるチャンネルだけ
- 別のアカウントにするには `youtube-token.json` を消す
- 設定のフォルダは、環境変数 `MEKURU_CONFIG_DIR` で変えられる

## ニコニコ動画

```
$ bunx mekuru-niconico login          # 初回だけ: ブラウザの窓でログインする
$ bun run upload:niconico             # 投稿ページに入力して投稿する
$ bun run upload:niconico --check     # 窓を開いて入力までする（投稿ボタンは自分で押す）
```

- ニコニコには投稿の API がない。`@mekuru/niconico` はヘッドレスブラウザ（Playwright）で投稿ページを開き、ファイルを選んで、タイトル・説明文・タグを入力し、「同意」のチェックを入れて投稿する
- 入力欄は「タイトル」「説明」「タグ」などのラベルで探す。ページが変わると動かなくなることがある
- 失敗したときは、そのときの画面を `.mekuru/niconico-error.png` に保存し、手で投稿するための内容（ファイル・タイトル・タグ・説明文）を表示する
- 設定: `video`・`title`（必須）・`description`・`tags`・`thumbnail`（`youtube.yaml` と同じ書き方）
- `--headed`: ブラウザの窓を見せながら投稿する

### 準備（初回だけ）

1. ブラウザを入れる: `bunx playwright-core install chromium`（すでにある Chrome・Chromium を使うなら、環境変数 `MEKURU_BROWSER` にその場所を書く）
2. `bunx mekuru-niconico login` で開く窓でログインする。ログインは `~/.config/mekuru/niconico-browser/` に保存される（Windows は `%APPDATA%\mekuru\`）
3. 最初は `--check` で、入力が正しいかを確かめる

### 注意

- 規約に自動投稿をはっきり禁止する条文はないが、運営は「不適切」と判断したアカウントを予告なく削除できる
- 別のアカウントにするには `niconico-browser` のフォルダを消して、ログインし直す
