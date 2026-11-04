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
bun add -d @mekuru/types @mekuru/core @mekuru/voisona
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/types"` (already set by `bun create @mekuru`).

## Quick start

Save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/types";
import { Voisona } from "@mekuru/voisona";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Voisona voice="tanaka-san_ja_JP" text={text} />
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

The package exports each character's settings for `<Voisona>`. Spread one and add other props as needed.

```tsx
import { Voisona, tanaka } from "@mekuru/voisona";

<Voisona {...tanaka} text="こんにちは。" />;
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

### Text, timing and cache

`<Voisona>` takes the [text and timing props](../speech/README.md#text-and-timing) and [caches audio](../speech/README.md#cache-and-preview) like every speech component. `name` defaults to `voice`.

### Connection

`url` → `MEKURU_VOISONA_URL` → the default URL, in that order. Check from the same environment as Bun:

```sh
curl --user "$MEKURU_VOISONA_USER" http://localhost:32766/api/talk/v1/voices
```

curl prompts for the API password. For HTTP 401, check the email and API password. For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`. Set `MEKURU_VOISONA_URL=http://127.0.0.1:32766` if `localhost` fails.

For custom narrators, `await Voisona.prepare({ ...voiceSettings, text })` returns shared audio, display text, and duration. Put `id` and `at` on the components that place it. See [shared audio sources](../speech/README.md#shared-audio-sources) and [composing narrators](../narrator/README.md).
