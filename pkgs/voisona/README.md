# @mekuru/voisona

[日本語](README.jp.md)

The `Voisona` component reads Mekuru Movie Maker dialogue through the VoiSona Talk REST API.

## Setup

Install VoiSona Talk 1.3.7 or later on Windows or macOS, sign in, and download a voice library. In Preferences → API, set an API password and enable the REST API (port `32766`). Keep the app running. See the [official setup guide](https://manual.voisona.com/en/talk/pc/2b6e9bc7efb18014b922c93fcaa8aac4).

Set these variables in the shell running Bun. Use your sign-in email and the password set in the API tab:

```sh
export MEKURU_VOISONA_USER='you@example.com'
export MEKURU_VOISONA_PASSWORD='your-api-password'
```

The example uses `tanaka-san_ja_JP` (田中傘). Use an installed library and follow its terms.

Requires Bun 1.4+, ffmpeg with libx264, ffprobe, and Japanese fonts. Install in the project folder:

```sh
bun add -d @mekuru/core @mekuru/cli @mekuru/voisona
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/core"` (already set by `bun create @mekuru`).

## Quick start

Save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/core";
import { Voisona } from "@mekuru/voisona";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Voisona voice="tanaka-san_ja_JP">{text}</Voisona>
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

The package exports each character's settings for `<Voisona>`. Spread one and add other props as needed.

```tsx
import { Voisona, tanaka } from "@mekuru/voisona";

<Voisona {...tanaka}>こんにちは。</Voisona>;
```

| Export | Name | `voice` |
| --- | --- | --- |
| `tanaka` | 田中傘 | `"tanaka-san_ja_JP"` |
| `chisa` | 知声 | `"chis-a_ja_JP"` |
| `sasara` | さとうささら | `"sato-sasara_ja_JP"` |
| `tsuzumi` | すずきつづみ | `"suzuki-tsudumi_ja_JP"` |
| `takahashi` | タカハシ | `"takahashi_ja_JP"` |
| `rikka` | 小春六花 | `"koharu-rikka_ja_JP"` |
| `karin` | 夏色花梨 | `"natsuki-karin_ja_JP"` |
| `chifuyu` | 花隈千冬 | `"hanakuma-chifuyu_ja_JP"` |
| `minato` | 双葉湊音 | `"futaba-minato_ja_JP"` |

## Detailed usage

### Voice (`VoisonaProps`)

- `voice`: Required. Voice library name, e.g. `"tanaka-san_ja_JP"`, or display name, e.g. `"田中傘"`.
- `version`: Voice library version. Default: newest installed version of the selected voice.
- `language`: Language code such as `"ja_JP"`. Default: the voice's first listed language.
- `speed`: Speaking speed, in the API's units.
- `pitch`: Pitch adjustment in cents.
- `volume`: Synthesis volume in dB.
- `alp`: Voice character parameter (`alp`).
- `huskiness`: Voice huskiness.
- `intonation`: Intonation strength.
- `style`: Map of style names to weights, e.g. `{ happy: 0.5 }` if that voice has a `happy` style. Unspecified weights keep the voice's defaults.
- `max-chars`: Maximum characters per synthesis request. Default: `500`.
- `url`: Base URL; default `http://localhost:32766`. Do not include `/api/talk/v1`.

Omitted numeric voice parameters use the API defaults. `/api/talk/v1/voices` lists voices, versions, and languages; `/api/talk/v1/voices/<voice_name>/<voice_version>` provides `style_names` and `default_style_weights`. Use `voice_name` if display names overlap. Long lines are split near punctuation and joined into one WAV; `gap` follows the complete line.

### Text and timing

- `children`: Dialogue: strings, numbers, fragments, or `<br />`. Empty speech is an error.
- `name`: Timeline speaker label. Default: `voice`.
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

`url` → `MEKURU_VOISONA_URL` → the default URL, in that order. Check from the same environment as Bun:

```sh
curl --user "$MEKURU_VOISONA_USER" http://localhost:32766/api/talk/v1/voices
```

curl prompts for the API password. For HTTP 401, check the email and API password. For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`. Set `MEKURU_VOISONA_URL=http://127.0.0.1:32766` if `localhost` fails.
