# @mekuru/style-bert-vits2

[日本語](README.jp.md)

The `StyleBertVits2` component reads Mekuru Movie Maker dialogue through the Style-Bert-VITS2 API server.

## Setup

Install [Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) using its installer or [Python setup guide](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/CLI.md). If not initialized, run `python initialize.py` to download resources and default models. Each model folder in `model_assets/` needs weights, `config.json`, and `style_vectors.npy`.

Start `python server_fastapi.py` in the engine folder (`Server.bat` on Windows). The API listens on `http://127.0.0.1:5000`. `/models/info` lists models, speakers (`spk2id`), and styles (`style2id`). Replace the example's `jvnv-F1-jp` with an installed model and follow its usage terms.

Requires Bun 1.4+, ffmpeg with libx264, ffprobe, and Japanese fonts. Install in the project folder:

```sh
bun add -d @mekuru/core @mekuru/cli @mekuru/style-bert-vits2
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/core"` (already set by `bun create @mekuru`).

## Quick start

Save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/core";
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
bunx mekuru-server .mekuru/main.xml
```

Preview: `http://localhost:3333`. Export with `bunx mekuru-compiler .mekuru/main.xml -o video.mp4`.

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

### Text and timing

- `children`: Dialogue: strings, numbers, fragments, or `<br />`. Empty speech is an error.
- `name`: Timeline speaker label. Default: `speaker` / `model` (uses `model` when `speaker` is omitted).
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

`url` → `MEKURU_STYLE_BERT_VITS2_URL` → the default URL, in that order. Check from the same environment as Bun:

```sh
curl http://127.0.0.1:5000/models/info
```

For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`.
