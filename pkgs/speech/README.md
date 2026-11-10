# @mekuru/speech

[日本語](README.jp.md)

Read Mekuru dialogue with **irodoru or VOICEVOX**. Each API has independent settings and communication; only WAV caching, display text and timeline timing are shared. `Speech` sends synthesis settings directly to irodoru's `POST /`, caches the WAV locally, and provides timing and display text for audio, subtitles, and lip sync.

## Setup

Requires Bun 1.4+. Set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/tsx"` in `tsconfig.json` (already set by `bun create @mekuru`).

```sh
bun add -d @mekuru/tsx @mekuru/core @mekuru/speech
```

In a sample project, keep `bun run irodoru` running in another terminal (requires Docker). To start the published model image directly:

```sh
docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/kanade-k-1228/irodoru:latest-mf
```

The first run downloads the image; no local model conversion or build is needed. Stop it with Ctrl+C. Wait for models to load before checking connectivity from Bun's environment. To update the image, run `docker pull ghcr.io/kanade-k-1228/irodoru:latest-mf`. For reproducible projects, pin a published version or digest in `package.json`.

```sh
curl http://127.0.0.1:8080/ -H 'content-type: application/json' \
  -d '{"text":"こんにちは","caption":"落ち着いた声","seed":1}' -o out.wav
```

The base URL is resolved from `url`, then `MEKURU_IRODORU_URL`, then `http://127.0.0.1:8080`. Requests are sent to `/` on that server. There is no health-check endpoint; the command above generates a WAV. For Windows/WSL, configure networking so Bun can reach that address. Follow the terms of the model, reference voice, and any character assets you use.

## Speech

```tsx
import { writeXml } from "@mekuru/tsx";
import { Speech, type SpeechProps } from "@mekuru/speech";

const narrator = {
  name: "Narrator",
  caption: "落ち着いた、聞き取りやすい女性の声",
  seed: 1,
} satisfies Omit<SpeechProps, "text">;

await writeXml(".mekuru/main.xml", (
  <mekuru fps={30}>
    <seq>
      <Speech {...narrator} text="こんにちは。" />
      <Speech {...narrator} text="今日の内容を紹介します。" />
    </seq>
  </mekuru>
));
```

Reuse ordinary objects or your own components for characters. `caption` describes the voice and delivery. `reference_audio_base64` takes an optional Base64-encoded WAV and may be combined with `caption`. Use `Buffer.from(await Bun.file("voice.wav").arrayBuffer()).toString("base64")`. References must be at least 0.5 seconds; the entire JSON request must fit within 64 MiB.

### Synthesis settings

Props use irodoru's API field names, without translating them into engine-neutral controls. Select the model with the server's Docker image: `latest-mf`, `latest-small`, or `latest-anime`. After switching models at the same URL, delete `.mekuru/cache/tts/` to regenerate audio.

| Prop | Default / meaning |
| --- | --- |
| `reference_audio_base64` | Base64-encoded reference WAV; omit for no reference. |
| `caption` | Voice/style description. |
| `seed` | `1`; non-negative safe integer. Change it for a different take. |
| `num_steps` | Model default; explicit values must be integers from 1 to 200. |
| `cfg_scale_text`, `cfg_scale_speaker`, `cfg_scale_caption` | `3`, `5`, `3`; RF model controls. |
| `cfg_min_t`, `cfg_max_t` | `0.5`, `1`. |
| `t_schedule`, `sway_coeff` | `"linear"`; for `"sway"`, coefficient defaults to `-1`. |
| `duration_scale` | `1`; in `(0, 5]`. Scales predicted duration. |
| `seconds` | Optional target synthesis duration, in `[0.5, 30]` seconds. |
| `trim_tail` | `true`; trim trailing silence. |

Explicit defaults are sent to the server, except model-dependent `num_steps`. The seed is fixed even when omitted. This keeps request conditions stable, but model or runtime changes may change the waveform. A fixed caption and seed alone do not guarantee a consistent speaker across lines; use reference audio when that matters.

### Text and timing

- `text`: Required text or text-only JSX. Use `text`, not children. `\n` remains a subtitle line break and becomes a space in spoken text.
- `reading`: Word-to-pronunciation dictionary. Longest match wins; displayed text stays unchanged.
- `name`: Timeline speaker label; defaults to `"irodoru"` for `Speech`, or the speaker for `Voicevox`.
- `gap`: Trailing silence in frames. Default: 0.3 seconds rounded to the nearest frame.
- `gain-db`: Playback gain in dB; does not change synthesis.
- `id`, `at`: Placement of the line.
- `len`: Timeline length in frames, overriding measured WAV duration plus `gap`. It does not control synthesized duration; use `seconds` for that.
- `max-chars`: Maximum Unicode characters per request, integer 1–1000, default 100. Long lines split preferentially at punctuation and their WAVs are joined. Each part uses the same synthesis settings and seed; `gap` is added only after the complete line.

The server accepts at most 1,000 characters per request and caps generated audio at 30 seconds. Character count cannot guarantee complete speech: shorten lines or reduce `max-chars` if necessary. Output near 30 seconds produces a warning unless `seconds` was explicitly set. A line split into multiple parts cannot use `seconds`; shorten the line or explicitly separate it into `Speech` components.

## Prepare audio, subtitles, and portraits together

```tsx
import { Audio } from "@mekuru/audio";
import { Speech } from "@mekuru/speech";
import { Subtitle } from "@mekuru/narrator";

const Narrator = async ({ text }: { text: string }) => {
  const line = await Speech.prepare({ caption: "落ち着いた声", text });
  return (
    <dur len={line.audio.len}>
      <stack>
        <Audio source={line.audio} />
        <Subtitle text={line.display} />
      </stack>
    </dur>
  );
};
```

Call `Speech.prepare()` inside an async component under `<mekuru>`, during `writeXml()` or `toXml()`. It returns a frozen `PreparedLine` with `audio: AudioSource` and `display: string`. Pass the same audio to a portrait's `Talk` for lip sync. Place `id` and `at` on the resulting components. See [narrator composition](../narrator/README.md).

`subtitleText(text)` expands text-only JSX to display text without synthesis. Root exports are `Speech`, `SpeechProps`, `LineProps`, `PreparedLine`, and `subtitleText`. `@mekuru/speech/irodoru` also exports `Speech`; VOICEVOX uses its own subpath.

Generation conditions (model, seed, steps, etc.) are embedded in the WAV's `LIST/INFO/ICMT` chunk. The client measures duration from WAV samples. A single-request WAV is saved unchanged, including metadata. Joined WAVs from split lines contain the combined audio without per-part generation metadata.

## Cache and preview

Audio lives in `.mekuru/cache/tts/`. The cache key includes the normalized server URL, synthesis settings, split text, split limit, and cache format version. Changing labels, placement, gain, subtitle-only text, `gap`, or `len` does not regenerate speech when the spoken text stays the same. Explicit default settings and omitted defaults share a cache entry.

Cached audio works with the server offline. irodoru does not perform discovery; VOICEVOX resolves named speakers only on cache misses. Replacing a model or VOICEVOX speaker data under the same name requires deleting `.mekuru/cache/tts/` to regenerate; these remote changes cannot be detected offline. irodoru reference audio contents are part of the key, so changing them regenerates speech.

Identical in-flight lines share one synthesis. irodoru requests run one at a time per base URL, with a five-minute timeout per request starting after the local queue. HTTP failures or invalid/empty WAV responses never become cache entries, and a later build can retry.

For uncached lines, `writeXml()` first writes estimated duration for immediate preview, then updates it with the WAV duration when synthesis finishes. `toXml()` waits for final audio. Text is expanded once per pass and shared by the audio, subtitle, and portrait.

## VOICEVOX

In a sample project, keep `bun run voicevox` running in another terminal. You can also start the VOICEVOX app. The Docker command is:

```sh
docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest
```

```tsx
import { Voicevox, zunda } from "@mekuru/speech/voicevox";

<Voicevox {...zunda} speed={1.2} text="こんにちは、ずんだもんなのだ。" />;
const line = await Voicevox.prepare({ ...zunda, text: "字幕や口パクと組み合わせるのだ。" });
```

`speaker` is a style ID or a name such as `"ずんだもん/ノーマル"`. Named speakers are resolved via `/speakers` on cache misses. Options are `speed`, `pitch`, `intonation`, `volume`, `pre`, `post`, and `pause-scale`; omitted values retain `/audio_query` defaults. `volume` changes synthesis; `gain-db` changes playback.

The URL resolves from `url`, then `MEKURU_VOICEVOX_URL`, then `http://127.0.0.1:50021`. Text and timing props use `LineProps`; `.prepare()` returns the same `PreparedLine` as irodoru. Caches are separated by engine, and cached speech needs no HTTP requests, including `/speakers`. The implementation does not depend on irodoru's settings, environment variables, or client.

Include credits such as `VOICEVOX:ずんだもん` as required by the voice you use.
