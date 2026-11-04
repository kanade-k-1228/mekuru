# @mekuru/style-bert-vits2

[日本語](README.jp.md)

The `StyleBertVits2` component reads Mekuru Movie Maker dialogue through the Style-Bert-VITS2 API server.

## Setup

Install [Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) using its installer or [Python setup guide](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/CLI.md). If not initialized, run `python initialize.py` to download resources and default models. Each model folder in `model_assets/` needs weights, `config.json`, and `style_vectors.npy`.

Start `python server_fastapi.py` in the engine folder (`Server.bat` on Windows). The API listens on `http://127.0.0.1:5000`. `/models/info` lists models, speakers (`spk2id`), and styles (`style2id`). Replace the example's `jvnv-F1-jp` with an installed model and follow its usage terms.

Requires Bun 1.4+, ffmpeg with libx264, ffprobe, and Japanese fonts. Install in the project folder:

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/style-bert-vits2
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/types"` (already set by `bun create @mekuru`).

## Quick start

Save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/types";
import { StyleBertVits2 } from "@mekuru/style-bert-vits2";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <StyleBertVits2 model="jvnv-F1-jp">{text}</StyleBertVits2>
      <text x="50%" y="50%" anchor="center" size={60} color="#FFFFFF">{text}</text>
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

The package exports each character's settings for `<StyleBertVits2>`. Spread one and add other props as needed.

```tsx
import { StyleBertVits2, amitaro } from "@mekuru/style-bert-vits2";

<StyleBertVits2 {...amitaro}>こんにちは。</StyleBertVits2>;
```

| Export | Name | `model` |
| --- | --- | --- |
| `koharuneAmi` | 小春音アミ | `"koharune-ami"` |
| `amitaro` | あみたろ | `"amitaro"` |

## Detailed usage

### Voice (`StyleBertVits2Props`)

- `model`: Required. Model folder name under `model_assets/`, not the numeric key in `/models/info`.
- `speaker`: Speaker name or numeric ID. Default: API default. Use a number such as `{0}` for an ID; a string is treated as a name.
- `style`: Style name from the model's `style2id`. Default: API default.
- `style-weight`: Strength of the selected style.
- `sdp-ratio`: Mixing ratio for the stochastic duration predictor.
- `noise`: Synthesis noise level.
- `noise-w`: Noise affecting phoneme duration.
- `length`: Speech duration multiplier; larger values produce slower speech. Separate from the frame-based `len` prop.
- `language`: `"JP"`, `"EN"`, or `"ZH"`. Default: `"JP"`; the model must support the language.
- `assist-text`: Text used to guide the voice's tone and expression.
- `assist-text-weight`: Strength of the assist text.
- `max-chars`: Maximum characters per synthesis request. Default: `100`. Match the server's `server.limit` in `config.yml`.
- `url`: Base URL; default `http://127.0.0.1:5000`.

Omitted synthesis options use the server's defaults, except `language` and `max-chars`. Check `/docs` for values. Long lines are split near punctuation, synthesized in order, and joined into one WAV; `gap` follows the complete line. HTTP 422 usually calls for checking the model, language, style, speaker, or text limit.

### Text, timing and cache

`<StyleBertVits2>` takes the [text and timing props](../speech/README.md#text-and-timing) and [caches audio](../speech/README.md#cache-and-preview) like every speech component. `name` defaults to `speaker`, or `model` when `speaker` is omitted.

### Connection

`url` → `MEKURU_STYLE_BERT_VITS2_URL` → the default URL, in that order. Check from the same environment as Bun:

```sh
curl http://127.0.0.1:5000/models/info
```

For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`.

For custom narrators, `await StyleBertVits2.prepare({ ...voiceSettings, children })` returns shared audio, display text, and duration. Put `id` and `at` on the components that place it. See [shared audio sources](../speech/README.md#shared-audio-sources) and [composing narrators](../narrator/README.md).
