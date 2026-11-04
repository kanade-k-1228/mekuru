# Mekuru Movie Maker

[日本語](README.jp.md)

Create explainer videos by writing scripts in text. Scenes adapt to speech duration; images, subtitles, and recorded footage share the same timeline. Footage supports cuts, speed changes, and pauses.

## Requirements

Check Bun and ffmpeg, and install them if missing:

```sh
curl -fsSL https://raw.githubusercontent.com/kanade-k-1228/mekuru/main/install.sh | bash
```

- [Bun](https://bun.sh/) 1.4 or later; packages run directly from TypeScript source.
- [ffmpeg / ffprobe](https://ffmpeg.org/) with libx264, and fonts (default: Noto Sans; add Noto Sans CJK for Chinese, Japanese or Korean).
- A speech engine for the selected voice.
- On Windows, run Mekuru in WSL.

Automatic installation supports apt on Ubuntu/Debian (including WSL) and [Homebrew](https://brew.sh/) on macOS. apt requires administrator privileges. If Bun is missing, it is installed with its official installer. Set up a speech engine and fonts separately.

Compatible existing tools are reused. An outdated Bun or ffmpeg without libx264 produces an error with update instructions. `MEKURU_FFMPEG` and `MEKURU_FFPROBE` overrides are respected.

## Quick start

```sh
bun create @mekuru my-video
cd my-video
bun install
bun preview     # http://localhost:3333
bun run build   # video.mp4
```

Choose speech engines during setup, then edit `src/main.tsx`. `<seq>` plays elements in order; `<stack>` plays them together. See the [first-video tutorial](example/README.md) for a complete example.

[@mekuru/types](pkgs/types/README.md) provides TSX types, the JSX runtime and XML output. [@mekuru/core](pkgs/core/README.md) provides the native compiler and preview server, including the viewer and platform binaries. Generated projects include both packages.

## Speech engines

[@mekuru/speech](pkgs/speech/README.md) has a component for each engine, imported from the engine's path:

| Import                                                                      | Component        | Engines                         |
| --------------------------------------------------------------------------- | ---------------- | ------------------------------- |
| [`@mekuru/speech/voicevox`](pkgs/speech/README.md#voicevox)                 | `Voicevox`       | VOICEVOX, AivisSpeech, SHAREVOX |
| [`@mekuru/speech/voisona`](pkgs/speech/README.md#voisona-talk)              | `Voisona`        | VoiSona Talk                    |
| [`@mekuru/speech/coeiroink`](pkgs/speech/README.md#coeiroink)               | `Coeiroink`      | COEIROINK                       |
| [`@mekuru/speech/style-bert-vits2`](pkgs/speech/README.md#style-bert-vits2) | `StyleBertVits2` | Style-Bert-VITS2                |

See [@mekuru/narrator](pkgs/narrator/README.md) to compose your own narrator from speech, a portrait, and subtitles.
