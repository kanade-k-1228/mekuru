# @mekuru/voicevox

[日本語](README.jp.md)

The `Voicevox` component reads Mekuru Movie Maker dialogue using VOICEVOX or an API-compatible engine.

## Setup

Start [VOICEVOX](https://voicevox.hiroshiba.jp/how_to_use/) on Windows, macOS, or Linux. Its engine listens on `http://127.0.0.1:50021`; `/speakers` lists voices and styles. Include a credit such as `VOICEVOX:ずんだもん` according to the [usage terms](https://voicevox.hiroshiba.jp/term/) and the character's terms.

Requires Bun 1.4+, ffmpeg with libx264, ffprobe, and Japanese fonts. Install in the project folder:

```sh
bun add -d @mekuru/core @mekuru/cli @mekuru/voicevox
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/core"` (already set by `bun create @mekuru`).

## Quick start

Save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/core";
import { Voicevox } from "@mekuru/voicevox";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Voicevox speaker="ずんだもん/ノーマル">{text}</Voicevox>
      <text x="50%" y="50%" anchor="center" size={60} color="#FFFFFF">{text}</text>
    </stack>
  </mekuru>,
);
```

```sh
bun src/main.tsx
bunx mekuru-server .mekuru/main.xml
```

Preview: `http://localhost:3333`. Export with `bunx mekuru-compiler .mekuru/main.xml -o video.mp4`.

## Detailed usage

### Voice (`VoicevoxProps`)

- `speaker`: Required. Numeric style ID, numeric string, or `"speaker/style"`, e.g. `"ずんだもん/ノーマル"`. A speaker name alone selects its first style.
- `speed`: Speaking speed (`speedScale`).
- `pitch`: Pitch (`pitchScale`), in the engine's units.
- `intonation`: Intonation strength (`intonationScale`).
- `volume`: Synthesis volume (`volumeScale`).
- `pre`, `post`: Silence before and after speech, in seconds.
- `pause-scale`: Pause duration multiplier (`pauseLengthScale`).
- `url`: Base URL; default `http://127.0.0.1:50021`.

Omitted synthesis options keep the engine's `/audio_query` values. For compatible engines, set `url` to `http://127.0.0.1:10101` (AivisSpeech) or `http://127.0.0.1:50025` (SHAREVOX), and choose a voice from that engine's `/speakers`.

### Text and timing

- `children`: Dialogue: strings, numbers, fragments, or `<br />`. Empty speech is an error.
- `name`: Timeline speaker label. Default: `speaker`.
- `reading`: Pronunciation dictionary, e.g. `{ Mekuru: "めくる" }`. Longer keys win; displayed text is unchanged.
- `gap`: Trailing silence in frames. Default: `Math.round(0.3 * fps)` (9 at 30 fps).
- `gain-db`: Playback gain in dB. Default: no adjustment.
- `len`: Total frames, including the gap. Default: rounded-up audio duration + `gap`. Does not change speaking speed.
- `id`, `at`: Identifier and start timing for the generated `<dur>`; see [timing](../../docs/reference/Syntax.md#timing-attributes).

Ruby `｜表示《よみ》` reads `よみ` and keeps `表示` in the timeline. ASCII `|` and `漢字《かんじ》` also work. `<br />` becomes a space; other nested elements are rejected. Use `<seq>` for successive lines and `<stack>` for speech with subtitles. For lip sync, wrap a line in a [portrait's `Talk`](../portrait/README.md).

### Cache and preview

- Audio is cached in `.mekuru/cache/tts/` by engine, voice settings, and spoken text. Cached lines work without a running engine.
- Connection URLs and playback settings do not invalidate audio. Remove the cached WAV to regenerate speech after changing a server or updating a model under the same name.
- `writeXml()` writes a silent draft while synthesizing, then replaces it with completed XML. Await it before video export.

### Connection

`url` → `MEKURU_VOICEVOX_URL` → the default URL, in that order. Check from the same environment as Bun:

```sh
curl http://127.0.0.1:50021/speakers
```

For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`.
