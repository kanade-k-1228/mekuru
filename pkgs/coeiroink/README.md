# @mekuru/coeiroink

[日本語](README.jp.md)

The `Coeiroink` component reads Mekuru Movie Maker dialogue using COEIROINK v2.

## Setup

Install [COEIROINK v2](https://coeiroink.com/download), download the desired voice from the app, and restart it. The engine listens on `http://127.0.0.1:50032`; `/v1/speakers` lists names, UUIDs, and styles. Include a credit such as `COEIROINK:つくよみちゃん` and follow the voice's terms.

Requires Bun 1.4+, ffmpeg with libx264, ffprobe, and Japanese fonts. Install in the project folder:

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/coeiroink
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/types"` (already set by `bun create @mekuru`).

## Quick start

Save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/types";
import { Coeiroink } from "@mekuru/coeiroink";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Coeiroink speaker="つくよみちゃん/れいせい" text={text} />
      <text x="50%" y="50%" anchor="center" size={60} color="#FFFFFF" text={text} />
    </stack>
  </mekuru>,
);
```

```sh
bun src/main.tsx
bunx mekuru-compiler .mekuru/main.xml --serve
```

Preview: `http://localhost:3333`. Export with `bunx mekuru-compiler .mekuru/main.xml -o video.mp4`.

## Characters

The package exports each character's settings for `<Coeiroink>`. Spread one and add other props as needed.

```tsx
import { Coeiroink, tsukuyomi } from "@mekuru/coeiroink";

<Coeiroink {...tsukuyomi} text="こんにちは。" />;
```

| Export | Name | `speaker` |
| --- | --- | --- |
| `tsukuyomi` | つくよみちゃん | `"つくよみちゃん"` |
| `mana` | MANA | `"MANA"` |
| `kana` | KANA | `"KANA"` |
| `ofutonp` | おふとんP | `"おふとんP"` |
| `ayaka` | AI声優-朱花 | `"AI声優-朱花"` |
| `aoba` | AI声優-青葉 | `"AI声優-青葉"` |
| `ginga` | AI声優-銀芽 | `"AI声優-銀芽"` |
| `kanae` | AI声優-金苗 | `"AI声優-金苗"` |
| `dia` | ディアちゃん | `"ディアちゃん"` |
| `arma` | アルマちゃん | `"アルマちゃん"` |
| `lilin` | リリンちゃん | `"リリンちゃん"` |
| `croix` | クロワちゃん | `"クロワちゃん"` |
| `andzie` | アンジーさん | `"アンジーさん"` |
| `ameno` | アメノちゃん | `"アメノちゃん"` |

## Detailed usage

### Voice (`CoeiroinkProps`)

- `speaker`: Required. A speaker name, `"speaker/style"`, speaker UUID (optionally followed by `/style`), or numeric style ID. A name or UUID alone selects its first style.
- `speed`: Speaking speed multiplier. Default: `1`.
- `pitch`: Pitch adjustment in COEIROINK's units. Default: `0`.
- `intonation`: Intonation strength. Default: `1`.
- `volume`: Synthesis volume multiplier. Default: `1`.
- `pre`, `post`: Silence before and after speech, in seconds. Default: `0.1` each.
- `pause`: Pause length for punctuation such as `、`, in seconds. Omitted by default, leaving it to the engine.
- `max-chars`: Maximum characters per synthesis request; longer lines are split near punctuation and joined into one WAV. Default: no limit.
- `url`: Base URL; default `http://127.0.0.1:50032`.

Unknown speakers are reported with the available speaker/style names. Check `/v1/speakers` and restart the app after downloading a voice.

### Text, timing and cache

`<Coeiroink>` takes the [text and timing props](../speech/README.md#text-and-timing) and [caches audio](../speech/README.md#cache-and-preview) like every speech component. `name` defaults to `speaker`.

### Connection

`url` → `MEKURU_COEIROINK_URL` → the default URL, in that order. Check from the same environment as Bun:

```sh
curl http://127.0.0.1:50032/v1/speakers
```

For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`.

For custom narrators, `await Coeiroink.prepare({ ...voiceSettings, text })` returns shared audio, display text, and duration. Put `id` and `at` on the components that place it. See [shared audio sources](../speech/README.md#shared-audio-sources) and [composing narrators](../narrator/README.md).
