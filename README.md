# Mekuru Movie Maker

[日本語](README.jp.md)

Create explainer videos by writing scripts in text. Scenes adapt to speech duration; images, subtitles, and recorded footage share the same timeline. Footage supports cuts, speed changes, and pauses.

## Requirements

Check Bun and ffmpeg, and install them if missing:

```sh
curl -fsSL https://raw.githubusercontent.com/kanade-k-1228/mekuru/main/install.sh | bash
```

- [Bun](https://bun.sh/) 1.4 or later; packages run directly from TypeScript source.
- [ffmpeg / ffprobe](https://ffmpeg.org/) with libx264, and Japanese fonts (default: Rounded Mplus 1c).
- A speech engine for the selected voice.
- On Windows, run Mekuru in WSL.

Automatic installation supports apt on Ubuntu/Debian (including WSL) and [Homebrew](https://brew.sh/) on macOS. apt requires administrator privileges. If Bun is missing, its official installer installs version 1.4.4. Set up a speech engine and Japanese fonts separately.

Compatible existing tools are reused. An outdated Bun or ffmpeg without libx264 produces an error with update instructions. `MEKURU_FFMPEG` and `MEKURU_FFPROBE` overrides are respected. To check without installing anything:

```sh
curl -fsSL https://raw.githubusercontent.com/kanade-k-1228/mekuru/main/install.sh | bash -s -- --check
```

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

| Package                                                       | Engines                         |
| ------------------------------------------------------------- | ------------------------------- |
| [`@mekuru/voicevox`](pkgs/voicevox/README.md)                 | VOICEVOX, AivisSpeech, SHAREVOX |
| [`@mekuru/voisona`](pkgs/voisona/README.md)                   | VoiSona Talk                    |
| [`@mekuru/coeiroink`](pkgs/coeiroink/README.md)               | COEIROINK                       |
| [`@mekuru/style-bert-vits2`](pkgs/style-bert-vits2/README.md) | Style-Bert-VITS2                |

See [@mekuru/narrator](pkgs/narrator/README.md) to compose your own narrator from speech, a portrait, and subtitles.
