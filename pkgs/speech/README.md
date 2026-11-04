# @mekuru/speech

[日本語](README.jp.md)

Speech components that read Mekuru Movie Maker dialogue with a speech engine: `Voicevox` for VOICEVOX, AivisSpeech and SHAREVOX, `Coeiroink` for COEIROINK, `StyleBertVits2` for Style-Bert-VITS2, and `Voisona` for VoiSona Talk. Import an engine's component and character settings from its own path, such as `@mekuru/speech/voicevox`, and the shared API from `@mekuru/speech`. Every component takes the same [text and timing props](#text-and-timing) and [caches audio](#cache-and-preview) the same way. Add another engine with [`defineEngine()`](#defineengineengine) or [`prepare()`](#preparekind-props-who-voice-synthesize).

## Setup

Requires Bun 1.4+, ffmpeg with libx264, ffprobe, and fonts (Noto Sans; Noto Sans CJK for Japanese text). Install in the project folder:

```sh
bun add -d @mekuru/types @mekuru/core @mekuru/speech
```

In `tsconfig.json`, set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/types"` (already set by `bun create @mekuru`). Set up your engine as described under [Engines](#engines).

## Quick start

Start VOICEVOX and save as `src/main.tsx`:

```tsx
import { writeXml } from "@mekuru/types";
import { Voicevox } from "@mekuru/speech/voicevox";

const text = "こんにちは。";

await writeXml(
  ".mekuru/main.xml",
  <mekuru size="1280x720" fps={30}>
    <stack>
      <Voicevox speaker="ずんだもん/ノーマル" text={text} />
      <text x="50%" y="50%" anchor="center" size={60} color="#FFFFFF" text={text} />
    </stack>
  </mekuru>,
);
```

```sh
bun src/main.tsx
bunx mekuru-compiler .mekuru/main.xml --serve
```

Preview: `http://localhost:3333`. Export with `bunx mekuru-compiler .mekuru/main.xml -o video.mp4`. Run scripts from the project folder so generated audio is stored in that project's `.mekuru/cache/tts/`.

For another engine, change the import, the component, and its voice settings:

```tsx
import { Coeiroink } from "@mekuru/speech/coeiroink";
import { StyleBertVits2 } from "@mekuru/speech/style-bert-vits2";
import { Voisona } from "@mekuru/speech/voisona";

<Coeiroink speaker="つくよみちゃん/れいせい" text={text} />;
<StyleBertVits2 model="jvnv-F1-jp" text={text} />;
<Voisona voice="tanaka-san_ja_JP" text={text} />;
```

## Engines

| Import | Component | Engine | Default URL | Environment variable | `name` default |
| --- | --- | --- | --- | --- | --- |
| [`@mekuru/speech/voicevox`](#voicevox) | `Voicevox` | VOICEVOX, AivisSpeech, SHAREVOX | `http://127.0.0.1:50021` | `MEKURU_VOICEVOX_URL` | `speaker` |
| [`@mekuru/speech/coeiroink`](#coeiroink) | `Coeiroink` | COEIROINK v2 | `http://127.0.0.1:50032` | `MEKURU_COEIROINK_URL` | `speaker` |
| [`@mekuru/speech/style-bert-vits2`](#style-bert-vits2) | `StyleBertVits2` | Style-Bert-VITS2 | `http://127.0.0.1:5000` | `MEKURU_STYLE_BERT_VITS2_URL` | `speaker`, or `model` when omitted |
| [`@mekuru/speech/voisona`](#voisona-talk) | `Voisona` | VoiSona Talk | `http://localhost:32766` | `MEKURU_VOISONA_URL` | `voice` |

Besides its voice settings and the [text and timing props](#text-and-timing), every component takes:

- `url`: Base URL of the engine: `url` → the environment variable in the table → the default URL, in that order.
- `max-chars`: Maximum characters per synthesis request. Longer lines are split near punctuation, synthesized in order, and joined into one WAV; `gap` follows the complete line. Default: no limit (`100` for Style-Bert-VITS2, `500` for VoiSona Talk).

Check the connection with the `curl` command in each engine's section, from the same environment as Bun. For connection errors, check the engine and port. On Windows, use [WSL mirrored networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking) to reach the engine through `127.0.0.1`.

Each engine's path also exports its characters' settings. Spread one into the component and add other props as needed.

```tsx
import { Voicevox, zunda } from "@mekuru/speech/voicevox";

<Voicevox {...zunda} text="こんにちは。" />;
```

### VOICEVOX

`<Voicevox>` from `@mekuru/speech/voicevox` reads with VOICEVOX or an API-compatible engine. Start [VOICEVOX](https://voicevox.hiroshiba.jp/how_to_use/) on Windows, macOS, or Linux. Include a credit such as `VOICEVOX:ずんだもん` according to the [usage terms](https://voicevox.hiroshiba.jp/term/) and the character's terms. List voices and styles with:

```sh
curl http://127.0.0.1:50021/speakers
```

Voice settings (`VoicevoxProps`):

- `speaker`: Required. Numeric style ID, numeric string, or `"speaker/style"`, e.g. `"ずんだもん/ノーマル"`. A speaker name alone selects its first style.
- `speed`: Speaking speed (`speedScale`).
- `pitch`: Pitch (`pitchScale`), in the engine's units.
- `intonation`: Intonation strength (`intonationScale`).
- `volume`: Synthesis volume (`volumeScale`).
- `pre`, `post`: Silence before and after speech, in seconds.
- `pause-scale`: Pause duration multiplier (`pauseLengthScale`).

Omitted synthesis options keep the engine's `/audio_query` values. For compatible engines, set `url` to `http://127.0.0.1:10101` (AivisSpeech) or `http://127.0.0.1:50025` (SHAREVOX), and choose a voice from that engine's `/speakers`.

| Export | Name | `speaker` | Engine |
| --- | --- | --- | --- |
| `zunda` | ずんだもん | `3` | VOICEVOX |
| `metan` | 四国めたん | `2` | VOICEVOX |
| `tsumugi` | 春日部つむぎ | `8` | VOICEVOX |
| `hau` | 雨晴はう | `10` | VOICEVOX |
| `ritsu` | 波音リツ | `9` | VOICEVOX |
| `takehiro` | 玄野武宏 | `11` | VOICEVOX |
| `kotaro` | 白上虎太郎 | `12` | VOICEVOX |
| `ryusei` | 青山龍星 | `13` | VOICEVOX |
| `himari` | 冥鳴ひまり | `14` | VOICEVOX |
| `sora` | 九州そら | `16` | VOICEVOX |
| `mochiko` | もち子さん | `20` | VOICEVOX |
| `mesuo` | 剣崎雌雄 | `21` | VOICEVOX |
| `zunko` | 東北ずん子 | `107` | VOICEVOX |
| `kiritan` | 東北きりたん | `108` | VOICEVOX |
| `itako` | 東北イタコ | `109` | VOICEVOX |
| `kohaku` | コハク | `"コハク"` | AivisSpeech |
| `mao` | まお | `"まお"` | AivisSpeech |
| `koharuneAmiSharevox` | 小春音アミ | `14` | SHAREVOX |
| `tsukuyomiSharevox` | つくよみちゃん | `18` | SHAREVOX |
| `ykun` | Yくん | `19` | SHAREVOX |
| `hakuchi` | 白痴ー | `20` | SHAREVOX |
| `lagopusBlack` | らごぱすブラック | `21` | SHAREVOX |
| `lagopusWhite` | らごぱすホワイト | `22` | SHAREVOX |
| `yuki` | 風花ゆき | `23` | SHAREVOX |
| `hiroha` | 安倍広葉 | `24` | SHAREVOX |
| `suzuno` | 鈴乃 | `25` | SHAREVOX |

AivisSpeech and SHAREVOX characters set `url` from `MEKURU_AIVISSPEECH_URL` or `MEKURU_SHAREVOX_URL`, defaulting to their local ports.

### COEIROINK

`<Coeiroink>` from `@mekuru/speech/coeiroink` reads with COEIROINK v2. Install [COEIROINK v2](https://coeiroink.com/download), download the desired voice from the app, and restart it. Include a credit such as `COEIROINK:つくよみちゃん` and follow the voice's terms. List names, UUIDs, and styles with:

```sh
curl http://127.0.0.1:50032/v1/speakers
```

Voice settings (`CoeiroinkProps`):

- `speaker`: Required. A speaker name, `"speaker/style"`, speaker UUID (optionally followed by `/style`), or numeric style ID. A name or UUID alone selects its first style.
- `speed`: Speaking speed multiplier. Default: `1`.
- `pitch`: Pitch adjustment in COEIROINK's units. Default: `0`.
- `intonation`: Intonation strength. Default: `1`.
- `volume`: Synthesis volume multiplier. Default: `1`.
- `pre`, `post`: Silence before and after speech, in seconds. Default: `0.1` each.
- `pause`: Pause length for punctuation such as `、`, in seconds. Omitted by default, leaving it to the engine.

Unknown speakers are reported with the available speaker/style names. Check `/v1/speakers` and restart the app after downloading a voice.

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

### Style-Bert-VITS2

`<StyleBertVits2>` from `@mekuru/speech/style-bert-vits2` reads through the Style-Bert-VITS2 API server. Install [Style-Bert-VITS2](https://github.com/litagin02/Style-Bert-VITS2) using its installer or [Python setup guide](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/CLI.md). If not initialized, run `python initialize.py` to download resources and default models. Each model folder in `model_assets/` needs weights, `config.json`, and `style_vectors.npy`.

Start `python server_fastapi.py` in the engine folder (`Server.bat` on Windows). List models, speakers (`spk2id`), and styles (`style2id`) with the command below. Replace the example's `jvnv-F1-jp` with an installed model and follow its usage terms.

```sh
curl http://127.0.0.1:5000/models/info
```

Voice settings (`StyleBertVits2Props`):

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

`max-chars` defaults to `100`; match the server's `server.limit` in `config.yml`. Omitted synthesis options other than `language` use the server's defaults; check `/docs` for values. HTTP 422 usually calls for checking the model, language, style, speaker, or text limit.

| Export | Name | `model` |
| --- | --- | --- |
| `koharuneAmi` | 小春音アミ | `"koharune-ami"` |
| `amitaro` | あみたろ | `"amitaro"` |

### VoiSona Talk

`<Voisona>` from `@mekuru/speech/voisona` reads through the VoiSona Talk REST API. Install VoiSona Talk 1.3.7 or later on Windows or macOS, sign in, and download a voice library. In Preferences → API, set an API password and enable the REST API (port `32766`). Keep the app running. See the [official setup guide](https://manual.voisona.com/en/talk/pc/2b6e9bc7efb18014b922c93fcaa8aac4).

Set these variables in the shell running Bun. Use your sign-in email and the password set in the API tab:

```sh
export MEKURU_VOISONA_USER='you@example.com'
export MEKURU_VOISONA_PASSWORD='your-api-password'
```

List voices, versions, and languages with the command below; curl prompts for the API password.

```sh
curl --user "$MEKURU_VOISONA_USER" http://localhost:32766/api/talk/v1/voices
```

For HTTP 401, check the email and API password. Set `MEKURU_VOISONA_URL=http://127.0.0.1:32766` if `localhost` fails. The example uses `tanaka-san_ja_JP` (田中傘); use an installed library and follow its terms.

Voice settings (`VoisonaProps`):

- `voice`: Required. Voice library name, e.g. `"tanaka-san_ja_JP"`, or display name, e.g. `"田中傘"`. Use `voice_name` if display names overlap.
- `version`: Voice library version. Default: newest installed version of the selected voice.
- `language`: Language code such as `"ja_JP"`. Default: the voice's first listed language.
- `speed`: Speaking speed, in the API's units.
- `pitch`: Pitch adjustment in cents.
- `volume`: Synthesis volume in dB.
- `alp`: Voice character parameter (`alp`).
- `huskiness`: Voice huskiness.
- `intonation`: Intonation strength.
- `style`: Map of style names to weights, e.g. `{ happy: 0.5 }` if that voice has a `happy` style. Unspecified weights keep the voice's defaults. `/api/talk/v1/voices/<voice_name>/<voice_version>` provides `style_names` and `default_style_weights`.

Omitted numeric voice parameters use the API defaults. Do not include `/api/talk/v1` in `url`.

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

### Text and timing

Every speech component, such as `<Voicevox>`, `<Coeiroink>`, `<StyleBertVits2>`, `<Voisona>` or one made with `defineSpeech()`, takes these props (`SpeechProps`) besides its voice settings:

- `text`: Required. Dialogue: a string, number, fragment, or component returning text. Empty speech and children are errors.
- `name`: Timeline speaker label. Default: the speaker (see the [Engines](#engines) table for which prop that is); `prepare()` uses `who`.
- `reading`: Pronunciation dictionary, e.g. `{ Mekuru: "めくる" }`. Longer keys win; displayed text is unchanged.
- `gap`: Trailing silence in frames. Default: `Math.round(0.3 * fps)` (9 at 30 fps).
- `gain-db`: Playback gain in dB; does not change the cached WAV. Default: no adjustment.
- `len`: Total frames, including the gap. Default: rounded-up audio duration + `gap`. Does not change speaking speed.
- `id`, `at`: Identifier and start timing for the generated `<dur>`; see [timing](../../docs/reference/Syntax.md#timing-attributes).

`\n` is read as a space and breaks the line in the displayed text. Synchronous and asynchronous components returning text also work; other elements are rejected. Use `<seq>` for successive lines and `<stack>` for speech with subtitles. For lip sync, wrap a line in a [portrait's `Talk`](../narrator/README.md).

### Cache and preview

- Audio is cached in `.mekuru/cache/tts/` by engine, voice settings, and spoken text. Cached lines work without a running engine.
- Connection URLs and playback settings do not invalidate audio. Remove the cached WAV to regenerate speech after changing a server or updating a model under the same name.
- On a cache miss, `writeXml()` writes a silent draft while synthesizing, then replaces it with completed XML. Await it before video export. The draft lasts 0.15 seconds per spoken character plus `gap`, or `len` if set. Outside draft mode, `toXml()` waits for synthesis.

### Shared audio sources

`Voisona.prepare(props)`, `Voicevox.prepare(props)`, `Coeiroink.prepare(props)`, and `StyleBertVits2.prepare(props)` return a `PreparedLine`. Pass `text`, voice, pronunciation, and duration settings; put `id` and `at` on the components that place the result. Call preparation in an async component under `<mekuru>`. See [composing narrators](../narrator/README.md) for custom narrators.

- `line.audio`: A readonly `AudioSource` (type exported by `@mekuru/audio`). `status` is `draft` or `ready`; `len` includes trailing silence in frames. `label` and `volume` describe playback. Ready sources have an absolute `src` path.
- `line.display`: The displayed string, with `\n` line breaks and each line trimmed. Text components expand once during preparation.
- `await subtitleText(text)`: Expands `text` to the same string as `line.display`, to show a line without speech.
- `<Audio source={line.audio} id="line" />`: Emits existing `<dur><audio /></dur>` elements.
- `readAudio(src, { gap?, len?, label?, volume? })`: Creates the same source from an existing WAV. The default gap is zero; relative paths use the project root captured at build start.

Custom engines use `prepare()` to create `{ audio, display }` and `defineSpeech()` to expose a JSX component with a `.prepare()` method.

Draft preparation returns an estimated source and queues synthesis; the final pass returns the WAV and its actual duration. Both use the same presentation components. Cache roots, progress, and in-flight synthesis belong to the build, independent of the working directory at import time.

### defineEngine(engine)

Makes the component for an engine with an HTTP API, like the bundled ones (see [VOICEVOX](src/voicevox/index.tsx)):

```tsx
import { defineEngine, type EngineProps } from "@mekuru/speech";

interface MySpeechProps extends EngineProps {
  speaker: number;
}

export const MySpeech = defineEngine<MySpeechProps>({
  kind: "my-engine",
  name: "My engine",
  defaultUrl: "http://127.0.0.1:8000",
  help: "  - start My engine",
  concurrency: 1,
  who: (props) => String(props.speaker),
  create: (call) => async (voice, text) =>
    (await call("/synthesis", { method: "POST", body: JSON.stringify({ ...voice, text }) })).arrayBuffer(),
});
```

- The props extend `EngineProps`, which adds `url` and `max-chars` to `SpeechProps`.
- The server is the `url` prop, else the environment variable `MEKURU_<KIND>_URL` named after `kind` (`MEKURU_MY_ENGINE_URL` here), else `defaultUrl`. Each server gets its own `create(call, url)` reader and runs `concurrency` lines at a time.
- `call(path, init)` sends a request to the server with a five-minute timeout. If the server cannot be reached, the error shows `help`, then how to set `url` or the environment variable and how to reach a server on Windows from WSL2; an HTTP error shows `name`, the path and the status.
- The reader gets `voice`, the props other than `SpeechProps` and `url`, which is also the cache key, and returns WAV bytes.
- Lines longer than the `max-chars` prop (default `maxChars`; no limit when neither is set) are split near punctuation, read part by part and joined.
- `who(props)` is the speaker's name when `name` is not set.
- `cached(load)` keeps what a reader loads once per server, such as the speaker list. A failed load is retried on the next line, and calling the result with `true` loads it again.

### prepare(kind, props, who, voice, synthesize)

For an engine without an HTTP API, make the component with `prepare()` and `defineSpeech()`. Pass this adapter a function that takes text and voice settings, writes a WAV to the given path, and resolves only after the write is complete:

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

Change `"my-engine"` to your engine's identifier and use the component returned by `createSpeech()` inside `<mekuru>`. `defineSpeech()` wraps the prepared audio in JSX (`<dur><audio /></dur>`) and needs the frame-rate context provided by `writeXml()` or `toXml()`.

- `kind`: Engine identifier used in the cache key.
- `props`: [`SpeechProps`](#text-and-timing), including dialogue text and timing options.
- `who`: Default speaker label when `props.name` is omitted.
- `voice`: Serializable settings that determine the synthesized voice; part of the cache key.
- `synthesize`: `(text: string, output: string) => Promise<void>`; writes the completed WAV to `output`.

The cache key contains `kind`, `voice`, and processed text. Include all synthesis settings in `voice`; omit connection details when a server change should reuse audio.

### Custom draft handling

For custom preparation, use `isDraft()` and `waitFor()` from `@mekuru/types`: register the synthesis promise and return `<dur len={estimatedFrames}><audio draft label="..." /></dur>` for the draft, then audio with a completed `src` on the final pass. `label` selects the timeline's speech track. `waitFor()` schedules the final pass only within `writeXml()`.

`Audio` and `readAudio` are provided by `@mekuru/audio`; `joinWavs(parts)`, which joins a nonempty array of WAV buffers with identical format chunks without resampling or converting them, is provided by `@mekuru/audio/wav`.
