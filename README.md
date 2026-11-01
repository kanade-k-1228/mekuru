# Mekuru Movie Maker

[日本語](README.jp.md)

Create explainer videos by writing scripts in text. Scenes adapt to speech duration; images, subtitles, and recorded footage share the same timeline. Footage supports cuts, speed changes, and pauses.

## Requirements

- [Bun](https://bun.sh/) 1.4 or later; packages run directly from TypeScript source.
- [ffmpeg / ffprobe](https://ffmpeg.org/) with libx264, and Japanese fonts (default: Rounded Mplus 1c).
- A speech engine for the selected voice.
- On Windows, run Mekuru in WSL.

## Quick start

```sh
bun create @mekuru my-video
cd my-video
bun install
bun preview     # http://localhost:3333
bun run build   # video.mp4
```

Choose speech engines during setup, then edit `src/main.tsx`. `<seq>` plays elements in order; `<stack>` plays them together. See the [first-video tutorial](example/README.md) for a complete example.

## Speech engines

| Package                                                       | Engines                         |
| ------------------------------------------------------------- | ------------------------------- |
| [`@mekuru/voicevox`](pkgs/voicevox/README.md)                 | VOICEVOX, AivisSpeech, SHAREVOX |
| [`@mekuru/voisona`](pkgs/voisona/README.md)                   | VoiSona Talk                    |
| [`@mekuru/coeiroink`](pkgs/coeiroink/README.md)               | COEIROINK                       |
| [`@mekuru/style-bert-vits2`](pkgs/style-bert-vits2/README.md) | Style-Bert-VITS2                |
