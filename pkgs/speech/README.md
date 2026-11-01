# @mekuru/speech

[日本語](README.jp.md)

Utilities for implementing Mekuru Movie Maker speech components. For an existing engine, use its own setup and usage guide: [VOICEVOX](../voicevox/README.md), [COEIROINK](../coeiroink/README.md), [Style-Bert-VITS2](../style-bert-vits2/README.md), or [VoiSona Talk](../voisona/README.md).

## Setup

Requires Bun 1.4 or later and `@mekuru/core`. Run scripts from the project folder so generated audio is stored in that project's `.mekuru/cache/tts/`.

```sh
bun add -d @mekuru/core @mekuru/speech
```

Set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/core"` in `tsconfig.json`. Prepare an engine adapter that accepts text and voice settings, writes a WAV to a specified path, and resolves only after the write is complete.

## Quick start

Save this reusable adapter as `src/speech.tsx`:

```tsx
import { line, voiceOf, type SpeechProps } from "@mekuru/speech";

interface CustomSpeechProps extends SpeechProps {
  speaker: string;
}

type Synthesize = (text: string, output: string, voice: { speaker: string }) => Promise<void>;

export const createSpeech = (synthesize: Synthesize) =>
  async (props: CustomSpeechProps) => {
    const voice = voiceOf(props);
    return line("my-engine", props, props.speaker, voice, (text, output) =>
      synthesize(text, output, voice),
    );
  };
```

Pass your WAV-writing callback to `createSpeech()` and use the returned component inside `<mekuru>`. Change `"my-engine"` to your engine's identifier. `line()` returns JSX (`<dur><audio /></dur>`) and needs the frame-rate context provided by `writeXml()` or `toXml()`.

## Detailed usage

### line(kind, props, who, voice, synthesize)

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

Ruby such as `｜表示《よみ》` uses `よみ` for synthesis and `表示` for the label. ASCII `|` also works; kanji can use `漢字《かんじ》` without a separator. `<br />` becomes a space. Other nested elements and components are rejected.

On a cache miss, `writeXml()` writes a silent draft, then replaces it after synthesis. Its estimate is 0.15 seconds per spoken character plus `gap`, unless `len` is set. Outside draft mode, `toXml()` waits for synthesis.

### Other exports

- `voiceOf(props)`: Removes the fields in `SpeechProps` and returns the remaining engine settings. Remove a connection-only `url` yourself before using those settings as a cache key.
- `joinWavs(parts)`: Joins a nonempty array of WAV buffers with identical format chunks. It does not resample or convert audio formats.

From `@mekuru/speech/engine`:

- `httpClient(url, name, help)`: Returns an HTTP request function for `url + path`. Adds a five-minute timeout and errors with engine-specific connection help or HTTP status. Add authentication in the adapter when required.
- `limit(concurrency)`: Returns a queue for async jobs. The limit must be a positive integer; create one queue per engine or server to share the limit.
- `splitText(text, max)`: Splits text into chunks of at most `max` Unicode code points, preferring punctuation and spaces. Trims chunk edges and omits empty chunks.

### Custom draft handling

Without `line()`, use `isDraft()` and `waitFor()` from `@mekuru/core`: register the synthesis promise and return `<dur len={estimatedFrames}><audio draft label="..." /></dur>` for the draft, then audio with a completed `src` on the final pass. `label` selects the timeline's speech track. `waitFor()` schedules the final pass only within `writeXml()`.
