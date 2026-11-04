# my-video

[Mekuru Movie Maker](https://github.com/kanade-k-1228/mekuru) の動画プロジェクト。台本は `src/main.tsx`。Bun 1.4 以上・libx264 付き ffmpeg・ffprobe・フォント（既定: Noto Sans。日本語には Noto Sans CJK も）が必要です。

空の台本から始めるプロジェクトです。`src/main.tsx` に要素を追加してください。音声サーバーは不要です。

```sh
bun install
bun preview     # 保存時に更新。http://localhost:3333
bun run build   # video.mp4
```

- YouTube: [初回の認証](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#youtube)後、`configs/youtube.yaml` を編集して `bun run upload:youtube`。 <!-- #if youtube -->
- ニコニコ動画: [初回の準備](https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md#ニコニコ動画)後、`configs/niconico.yaml` を編集して `bun run upload:niconico`。 <!-- #if niconico -->
