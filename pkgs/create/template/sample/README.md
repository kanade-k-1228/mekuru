# my-video

[Mekuru Movie Maker](https://github.com/kanade-k-1228/mekuru) の動画プロジェクト。台本は `src/main.tsx`。Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・フォント（既定: Noto Sans。日本語には Noto Sans CJK も）が必要です。

irodoru の音声サンプルと音声パッケージが入っています。Docker を起動し、別のターミナルで `bun run irodoru` を実行したまま、プレビュー・書き出しを行います。モデル入りの公開イメージを使うため、ソースの取得やローカルビルドは不要です。

```sh
bun install
bun run irodoru # 別のターミナルで起動したままにする（Docker が必要）
bun preview     # 保存時に更新。http://localhost:3333
bun run build   # video.mp4
```

- irodoru: `ghcr.io/kanade-k-1228/irodoru:latest-mf` を起動します。初回はイメージを取得し、終了は Ctrl+C。既定の接続先は `http://127.0.0.1:8080`。別の接続先は `MEKURU_IRODORU_URL` で指定します。
- サンプルは `mf` モデルと caption による声の指定を使います。参照音声は不要です。
- VOICEVOX: `bun run voicevox` で CPU 版を `http://127.0.0.1:50021` に起動できます。台本は `import { Voicevox, zunda } from "@mekuru/speech/voicevox";` と `<Voicevox {...zunda} text="こんにちは。" />` に変更します。VOICEVOX アプリの起動でも構いません。
- [音声合成の設定](https://github.com/kanade-k-1228/mekuru/blob/main/pkgs/speech/README.jp.md)。使用するモデル・声・キャラクター・素材の利用規約に従ってください。
- YouTube: [初回の認証](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#youtube)後、`configs/youtube.yaml` を編集して `bun run upload:youtube`。 <!-- #if youtube -->
- ニコニコ動画: [初回の準備](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#ニコニコ動画)後、`configs/niconico.yaml` を編集して `bun run upload:niconico`。 <!-- #if niconico -->
