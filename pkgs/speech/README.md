# @mekuru/speech

[日本語](README.jp.md)

Utilities for implementing Mekuru Movie Maker speech components. For an existing engine, use its own setup and usage guide: [VOICEVOX](../voicevox/README.md), [COEIROINK](../coeiroink/README.md), [Style-Bert-VITS2](../style-bert-vits2/README.md), or [VoiSona Talk](../voisona/README.md).

## Setup

Requires Bun 1.4 or later and `@mekuru/types`. Run scripts from the project folder so generated audio is stored in that project's `.mekuru/cache/tts/`.

```sh
bun add -d @mekuru/types @mekuru/speech
```

Set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/types"` in `tsconfig.json`. Prepare an engine adapter that accepts text and voice settings, writes a WAV to a specified path, and resolves only after the write is complete.

## Quick start

Save this reusable adapter as `src/speech.tsx`:

```tsx
import { defineSpeech, prepare, type SpeechProps } from "@mekuru/speech";

interface CustomSpeechProps extends SpeechProps {
  speaker: string;
}

type Synthesize = (text: string, output: string, voice: { speaker: string }) => Promise<void>;

export const createSpeech = (synthesize: Synthesize) =>
  defineSpeech<CustomSpeechProps>(async (props) => {
    const voice = { speaker: props.speaker };
    return prepare("my-engine", props, props.speaker, voice, (text, output) =>
      synthesize(text, output, voice),
    );
  });
```

Pass your WAV-writing callback to `createSpeech()` and use the returned component inside `<mekuru>`. Change `"my-engine"` to your engine's identifier. `defineSpeech()` wraps the prepared audio in JSX (`<dur><audio /></dur>`) and needs the frame-rate context provided by `writeXml()` or `toXml()`. For an engine with an HTTP API, [`defineEngine()`](#defineengineengine) does the rest.

## Detailed usage

### prepare(kind, props, who, voice, synthesize)

- `kind`: Engine identifier used in the cache key.
- `props`: `SpeechProps`, including dialogue text and timing options.
- `who`: Default speaker label when `props.name` is omitted.
- `voice`: Serializable settings that determine the synthesized voice; part of the cache key.
- `synthesize`: `(text: string, output: string) => Promise<void>`; writes the completed WAV to `output`.

The cache key contains `kind`, `voice`, and processed text. Include all synthesis settings in `voice`; omit connection details when a server change should reuse audio.

`SpeechProps` fields:

- `children`: Dialogue text; strings, numbers, fragments, and `<br />` are supported. Empty speech is an error.
- `name`: Timeline label; defaults to `who`.
- `reading`: Pronunciation dictionary. Longer keys take priority; only spoken text changes.
- `gap`: Silence after the line, in frames. Default: `Math.round(0.3 * fps)`.
- `gain-db`: Playback gain in dB; does not change the cached WAV.
- `len`: Explicit total duration in frames; otherwise, audio duration rounded up to frames plus `gap`.
- `id`, `at`: Passed to the surrounding `<dur>`; see [timing syntax](../../docs/reference/Syntax.md#timing-attributes).

Ruby such as `｜表示《よみ》` uses `よみ` for synthesis and `表示` for the label. ASCII `|` also works; kanji can use `漢字《かんじ》` without a separator. `<br />` becomes a space. Synchronous and asynchronous components returning text or `<br />` are supported; other elements are rejected.

On a cache miss, `writeXml()` writes a silent draft, then replaces it after synthesis. Its estimate is 0.15 seconds per spoken character plus `gap`, unless `len` is set. Outside draft mode, `toXml()` waits for synthesis.

### Shared audio sources

`Voisona.prepare(props)`, `Voicevox.prepare(props)`, `Coeiroink.prepare(props)`, and `StyleBertVits2.prepare(props)` return a `PreparedLine`. Pass children, voice, pronunciation, and duration settings; put `id` and `at` on the components that place the result. Call preparation in an async component under `<mekuru>`.

- `line.audio`: A readonly `AudioSource` (type exported by `@mekuru/audio`). `status` is `draft` or `ready`; `len` includes trailing silence in frames. `label` and `volume` describe playback. Ready sources have an absolute `src` path.
- `line.display`: Display nodes preserving ruby base text, whitespace, and breaks. Text components expand once during preparation.
- `<Audio source={line.audio} id="line" />`: Emits existing `<dur><audio /></dur>` elements.
- `readAudio(src, { gap?, len?, label?, volume? })`: Creates the same source from an existing WAV. The default gap is zero; relative paths use the project root captured at build start.

Custom engines use `prepare()` to create `{ audio, display }` and `defineSpeech()` to expose a JSX component with a `.prepare()` method. Migrate `line()` callers to this composition and read duration from `line.audio.len` instead of the removed `line.len` getter.

Draft preparation returns an estimated source and queues synthesis; the final pass returns the WAV and its actual duration. Both use the same presentation components. Cache roots, progress, and in-flight synthesis belong to the build, independent of the working directory at import time.

### Other exports

- `await subtitleText(children)`: Converts ruby notation to display text and preserves whitespace and `<br />`. Also available from the text-only entry point `@mekuru/speech/text`, using the same input format as speech. For subtitle placement and styling, use `Subtitle` from [@mekuru/narrator](../narrator/README.md).
- `joinWavs(parts)`: Joins a nonempty array of WAV buffers with identical format chunks. It does not resample or convert audio formats.

### defineEngine(engine)

Makes the component for an engine with an HTTP API, like the bundled ones (see [VOICEVOX](../voicevox/src/index.tsx)):

```tsx
import { defineEngine, type SpeechProps } from "@mekuru/speech";

interface MySpeechProps extends SpeechProps {
  speaker: number;
  url?: string;
}

export const MySpeech = defineEngine<MySpeechProps>({
  kind: "my-engine",
  name: "My engine",
  env: "MY_ENGINE_URL",
  defaultUrl: "http://127.0.0.1:8000",
  help: "  - start My engine",
  concurrency: 1,
  who: (props) => String(props.speaker),
  create: (call) => async (voice, text) =>
    (await call("/synthesis", { method: "POST", body: JSON.stringify({ ...voice, text }) })).arrayBuffer(),
});
```

- The server is the `url` prop, else the `env` environment variable, else `defaultUrl`. Each server gets its own `create(call, url)` reader and runs `concurrency` lines at a time.
- `call(path, init)` sends a request to the server with a five-minute timeout. If the server cannot be reached, the error shows `help`; an HTTP error shows `name`, the path and the status.
- The reader gets `voice`, the props other than `SpeechProps` and `url`, which is also the cache key, and returns WAV bytes.
- With `maxChars`, lines longer than the `max-chars` prop (default `maxChars`) are split near punctuation, read part by part and joined.
- `who(props)` is the speaker's name when `name` is not set.
- `cached(load)` keeps what a reader loads once per server, such as the speaker list. A failed load is retried on the next line, and calling the result with `true` loads it again.

### Custom draft handling

For custom preparation, use `isDraft()` and `waitFor()` from `@mekuru/types`: register the synthesis promise and return `<dur len={estimatedFrames}><audio draft label="..." /></dur>` for the draft, then audio with a completed `src` on the final pass. `label` selects the timeline's speech track. `waitFor()` schedules the final pass only within `writeXml()`.

`Audio` and `readAudio` are provided by `@mekuru/audio`; `joinWavs` is provided by `@mekuru/audio/wav`.
