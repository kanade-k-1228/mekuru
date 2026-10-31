# my-video

[Mekuru Movie Maker](https://github.com/kanade-k-1228/mekuru) で作る動画のプロジェクトです。台本は `src/main.tsx` です。

```
bun install
bun preview     # プレビュー（保存するたびに更新されます）
bun run build   # video.mp4 に書き出す
```

- VOICEVOX: アプリを起動するか、`docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest` でエンジンを起動してください。動画には「VOICEVOX:ずんだもん」のようなクレジットが必要です（キャラクターごとの利用規約も確認してください）。 <!-- #if voicevox -->
- AivisSpeech: アプリを起動するか、`docker run --rm -p 127.0.0.1:10101:10101 ghcr.io/aivis-project/aivisspeech-engine:cpu-latest` でエンジンを起動してください。音声合成モデルごとの利用規約も確認してください。 <!-- #if aivisspeech -->
- COEIROINK: COEIROINK（v2）のアプリを起動してください。つくよみちゃん以外は、アプリの「キャラクターダウンロード」で入れます。動画には「COEIROINK:つくよみちゃん」のようなクレジットが必要です。 <!-- #if coeiroink -->
- SHAREVOX: アプリを起動してください。動画には「SHAREVOX:小春音アミ」のようなクレジットが必要です（キャラクターごとの利用規約も確認してください）。 <!-- #if sharevox -->
- Style-Bert-VITS2: API サーバー（`python server_fastapi.py`。Windows は `Server.bat`）を起動してください。小春音アミ・あみたろの声には「Style-BertVITS2モデル: 小春音アミ、あみたろの声素材工房 (https://amitaro.net/)」のようなクレジットが必要です。 <!-- #if style-bert-vits2 -->
- `assets/character/` の立ち絵はダミーです。 <!-- #if voicevox aivisspeech coeiroink sharevox style-bert-vits2 -->
- 書き出しには ffmpeg が必要です。
- YouTube: `bun run upload:youtube` で、`configs/youtube.yaml` の動画・タイトル・説明文などでアップロードします（別のパターンは `configs/` にファイルを増やし、`bun run upload:youtube configs/<ファイル>.yaml`）。初回は Google Cloud で OAuth クライアントを作る準備が必要です（[手順](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.md)）。 <!-- #if youtube -->
- ニコニコ動画: `bun run upload:niconico` で、`configs/niconico.yaml` の動画・タイトル・説明文・タグを投稿ページに入力して投稿します（ニコニコには投稿の API がないので、ヘッドレスブラウザを使います）。初回は `bunx playwright-core install chromium` と `bunx mekuru-niconico login`（ブラウザでログイン）が必要です。 <!-- #if niconico -->
