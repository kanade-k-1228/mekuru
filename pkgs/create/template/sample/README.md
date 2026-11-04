# my-video

[Mekuru Movie Maker](https://github.com/kanade-k-1228/mekuru) の動画プロジェクト。台本は `src/main.tsx`。Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・フォント（既定: Noto Sans。日本語には Noto Sans CJK も）が必要です。

VOICEVOX のサンプルと音声パッケージが入っています。Docker を起動し、別のターミナルで `bun run voicevox` を実行したままにして、プレビュー・書き出しを行います。VOICEVOX アプリを使う場合は、アプリの起動だけで構いません。

```sh
bun install
bun run voicevox # 別のターミナルで起動したままにする（Docker が必要）
bun preview     # 保存時に更新。http://localhost:3333
bun run build   # video.mp4
```

- VOICEVOX: `bun run voicevox` は CPU 版サーバーを `http://127.0.0.1:50021` で起動します。初回はイメージを取得します。終了は Ctrl+C。
- `VOICEVOX:ずんだもん` などのクレジットを記載します。[設定と使い方](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/speech/README.jp.md#voicevox)。
- 他のエンジンへ変更する場合は [音声合成の説明](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/speech/README.jp.md) を参照してください。
- 声・キャラクター・素材の利用規約に従ってください。
- YouTube: [初回の認証](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#youtube)後、`configs/youtube.yaml` を編集して `bun run upload:youtube`。 <!-- #if youtube -->
- ニコニコ動画: [初回の準備](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#ニコニコ動画)後、`configs/niconico.yaml` を編集して `bun run upload:niconico`。 <!-- #if niconico -->
