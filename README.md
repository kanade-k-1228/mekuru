# Mekuru Movie Maker

[日本語](README.jp.md)

Create explainer videos by writing scripts in text. Scenes adapt to speech duration; images, subtitles, and recorded footage share the same timeline. Footage supports cuts, speed changes, and pauses.

## Quick Start

### 1. Install requirements

Just run this to install requirements:

```sh
curl -fsSL https://raw.githubusercontent.com/kanade-k-1228/mekuru/main/install.sh | bash
```

- [Bun](https://bun.sh/) 1.4 or later
- [ffmpeg / ffprobe](https://ffmpeg.org/) with libx264
- Noto Sans font (the default font)

> Automatic installation supports apt on Ubuntu/Debian (including WSL) and [Homebrew](https://brew.sh/) on macOS. apt requires administrator privileges. If Bun is missing, it is installed with its official installer.

> Compatible existing tools are reused. An outdated Bun or ffmpeg without libx264 produces an error with update instructions. `MEKURU_FFMPEG` and `MEKURU_FFPROBE` overrides are respected.

### 2. Create project

```sh
bun create @mekuru my-video
cd my-video
bun install
bun run voicevox # keep running in another terminal (requires Docker)
bun preview     # http://localhost:3333
bun run build   # video.mp4
```

### 3. Edit video

```tsx
// src/main.tsx
import { writeXml } from "@mekuru/tsx";
import { Voicevox, zunda } from "@mekuru/speech/voicevox";

const Video = () => (
  <mekuru size="1920x1080" fps={30}>
    <rect w="100%" h="100%" fill="#141C26" />
    {/* <stack> plays its children together; <seq> plays them in order. */}
    <stack>
      <text x="50%" y="40%" anchor="center" size={90} text="My first video" />
      <seq>
        <Voicevox {...zunda} text="Hello! This is my first video." />
        <Voicevox {...zunda} text="The title stays until both lines end." />
      </seq>
    </stack>
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
```

The default “VOICEVOX sample” includes speech and its required packages. Keep `bun run voicevox` (Docker) or the VOICEVOX app running. To start with a blank script, select “Empty project” during creation or pass `--template empty`. See the [first-video tutorial](example/README.md) for a complete example.

> [@mekuru/tsx](pkgs/tsx/README.md) provides TSX types, the JSX runtime and XML output. [@mekuru/core](pkgs/core/README.md) provides the native compiler and preview server, including the viewer and platform binaries. Generated projects include both packages.
