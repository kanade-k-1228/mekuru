# Mekuru Movie Maker

[English](README.md)

テキストで台本を記述して解説動画を作るツールです。場面の長さはセリフの音声に合わせて決まり、画像・字幕・撮影した動画を同じ時間軸で組み合わせられます。動画のカット・速度変更・一時停止にも対応します。

## 必要なもの

- [Bun](https://bun.sh/) 1.4 以上。パッケージは TypeScript ソースを直接実行します。
- libx264 付き [ffmpeg・ffprobe](https://ffmpeg.org/) と日本語フォント（既定: Rounded Mplus 1c）。
- 使用する声の音声合成エンジン。
- Windows では WSL で実行します。

## はじめる

```sh
bun create @mekuru my-video
cd my-video
bun install
bun preview     # http://localhost:3333
bun run build   # video.mp4
```

作成時にキャラクターを選び、`src/main.tsx` を編集します。`<seq>` は順番に、`<stack>` は同時に再生します。完成までの手順は [最初の動画を作るチュートリアル](example/README.md) を参照してください。
