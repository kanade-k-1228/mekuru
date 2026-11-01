# my-video

[Mekuru Movie Maker](https://github.com/kanade-k-1228/mekuru) の動画プロジェクト。台本は `src/main.tsx`。Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・日本語フォントが必要です。

```sh
bun install
bun preview     # 保存時に更新。http://localhost:3333
bun run build   # video.mp4
```

- VOICEVOX: アプリを起動し、`VOICEVOX:ずんだもん` などのクレジットを記載します。[設定と使い方](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/voicevox/README.jp.md)。 <!-- #if voicevox -->
- AivisSpeech: アプリを起動します。[接続設定](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/voicevox/README.jp.md)とモデルの利用規約を確認してください。 <!-- #if aivisspeech -->
- COEIROINK: v2 のアプリで声を追加して起動し、`COEIROINK:つくよみちゃん` などのクレジットを記載します。[設定と使い方](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/coeiroink/README.jp.md)。 <!-- #if coeiroink -->
- SHAREVOX: アプリを起動し、`SHAREVOX:小春音アミ` などのクレジットを記載します。[接続設定](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/voicevox/README.jp.md)。 <!-- #if sharevox -->
- Style-Bert-VITS2: `python server_fastapi.py`（Windows は `Server.bat`）を起動します。[設定とモデルの準備](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/style-bert-vits2/README.jp.md)。小春音アミ・あみたろの声のクレジット例: `Style-BertVITS2モデル: 小春音アミ、あみたろの声素材工房 (https://amitaro.net/)`。 <!-- #if style-bert-vits2 -->
- VoiSona Talk: サインインし、REST API を有効にします。認証と声の指定は[設定手順](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/voisona/README.jp.md)を参照してください。 <!-- #if voisona -->
- `assets/character/` の立ち絵はダミーです。声・キャラクター・素材の利用規約に従ってください。 <!-- #if voicevox aivisspeech coeiroink sharevox style-bert-vits2 voisona -->
- YouTube: [初回の認証](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#youtube)後、`configs/youtube.yaml` を編集して `bun run upload:youtube`。 <!-- #if youtube -->
- ニコニコ動画: [初回の準備](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#ニコニコ動画)後、`configs/niconico.yaml` を編集して `bun run upload:niconico`。 <!-- #if niconico -->
