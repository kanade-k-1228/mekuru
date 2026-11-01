# @mekuru/coeiroink

[日本語](README.jp.md)

The `Coeiroink` component reads Mekuru Movie Maker dialogue using COEIROINK v2.

## Setup

Install [COEIROINK v2](https://coeiroink.com/download), download the desired voice from the app, and restart it. The engine listens on `http://127.0.0.1:50032`; `/v1/speakers` lists names, UUIDs, and styles. Include a credit such as `COEIROINK:つくよみちゃん` and follow the voice's terms.

Requires Bun 1.4+, ffmpeg with libx264, ffprobe, and Japanese fonts. Install in the project folder:

```sh
bun add -d @mekuru/core @mekuru/cli @mekuru/coeiroink
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/core"` (already set by `bun create @mekuru`).

## Quick start

Save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/core";
import { Coeiroink } from "@mekuru/coeiroink";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Coeiroink speaker="つくよみちゃん/れいせい">{text}</Coeiroink>
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

## Characters

The package exports each character's settings for `<Coeiroink>`. Spread one and add other props as needed.

```tsx
import { Coeiroink, tsukuyomi } from "@mekuru/coeiroink";

<Coeiroink {...tsukuyomi}>こんにちは。</Coeiroink>;
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
- `url`: Base URL; default `http://127.0.0.1:50032`.

Unknown speakers are reported with the available speaker/style names. Check `/v1/speakers` and restart the app after downloading a voice.

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

`url` → `MEKURU_COEIROINK_URL` → the default URL, in that order. Check from the same environment as Bun:

```sh
curl http://127.0.0.1:50032/v1/speakers
```

For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`.
