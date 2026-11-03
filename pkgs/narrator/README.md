# @mekuru/narrator

[日本語](README.jp.md)

Shared components for building your own narrator from synthesized speech, a portrait, and subtitles. Provides portraits, blinking, lip sync, subtitles, and PSD asset preparation.

## Setup

Requires Bun 1.4 or later.

```sh
bun add -d @mekuru/core @mekuru/narrator
```

Set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/core"` in `tsconfig.json`. Install your speech engine separately and provide portrait image assets.

## Compose a narrator

This example also uses `@mekuru/voisona` and `@mekuru/speech`. Replace `src` with your portrait folder.

```tsx
import type { At, Node } from "@mekuru/core";
import { portrait, Subtitle, type Face } from "@mekuru/narrator";

import { Audio } from "@mekuru/audio";
import { Voisona } from "@mekuru/voisona";

const actor = portrait({ src: "assets/character/tsuzumi" });
type TsuzumiProps = { children?: Node; face?: Face; id?: string; at?: At };

export const TsuzumiStand = actor.Stand;
export const Tsuzumi = async ({ children, face, id, at }: TsuzumiProps) => {
  const line = await Voisona.prepare({ voice: "suzuki-tsudumi_ja_JP", children });
  return (
    <dur len={line.len} id={id} at={at}>
      <stack>
        <Audio source={line.audio} />
        <actor.Talk source={line.audio} face={face} />
        <Subtitle color="#E0161E">{line.display}</Subtitle>
      </stack>
    </dur>
  );
};
```

Place `<Tsuzumi>漢字《かんじ》を読みます。</Tsuzumi>` inside `<mekuru>`. Speech uses “かんじ”, while the subtitle shows “漢字”. To show an idle portrait, place `<TsuzumiStand />` in the scene's `<stack>`.

- The speech component owns synthesis, caching, and duration.
- `portrait()` in this package owns expressions, lip sync, and idle portraits. Use `<image>` for a static portrait.
- `prepare` expands the text once and returns display text and a shared audio source. `line.len` is the source duration. The outer `<dur>` fixes the line interval even when decorations are added.

## Portraits and lip sync

`portrait({ src, ...options })` layers images in YMM4's animated portrait format. `Stand` provides idle animation; `Talk` uses the shared audio source's duration and amplitude for speaking animation. Use `face` and `faces` for expressions, `blink` for blinking, and `x`, `y`, `w`, `h`, and `z` for placement.

See [portraits](../../docs/reference/Portrait.md) for the image folder structure and detailed examples. For assets prepared from PSD files, use `psdPortrait()` from this same package.

## Subtitle / SubtitleProps

`SubtitleProps` is `IntrinsicElements["text"]`: all native text placement, styling, and timing props are accepted.

Defaults: `x="50%"`, `y="95%"`, `anchor="b"`, `max-w="90%"`, `align="center"`, `size={54}`, white text, black stroke of width 7, and `z={100}`. Override any default through props.

```tsx
<Subtitle y="90%" size={48} stroke="#2E5E8C">
  Mekuru の字幕です。<br />Explicit line breaks are preserved.
</Subtitle>
```

`Subtitle` expands children exactly like `<text>`. It does not trim whitespace or transform ruby notation; `pre` is passed through. For speech, pass `line.display`. For a standalone conversion, pass `await subtitleText(children)`.

## subtitleText(children): Promise<Node>

Converts ruby notation to display text while retaining `<br />`. Use it to build custom subtitles. This is a re-export of the same function from `@mekuru/speech/text`.

```tsx
import type { Node } from "@mekuru/core";
import { subtitleText } from "@mekuru/narrator";

const MySubtitle = async ({ children }: { children?: Node }) => (
  <text x="50%" y="95%" anchor="b" size={48}>
    {await subtitleText(children)}
  </text>
);
```

For multiple outlines, layer `Subtitle` components at the same position with different `stroke` and `stroke-width` values.

## Migrating composition code

- Import portrait functions and types from `@mekuru/narrator`. Names such as `portrait`, `psdPortrait`, and `Face` are unchanged; no separate portrait package is needed.
- Replace `<actor.Talk><Voisona ... /></actor.Talk>` with one `Voisona.prepare(...)` call, then `<Audio source={line.audio} />` and `<actor.Talk source={line.audio} />`. Use `readAudio` for an existing WAV.
- `Subtitle` no longer converts ruby implicitly. Pass `line.display` for speech, or `await subtitleText(children)` for standalone subtitles.
- `subtitleText` is asynchronous to support text components. Make custom subtitle components `async` and await the result.
- Existing speech-only JSX components such as `<Voisona>` still work.

## Mekuru-compatible PSD layer naming

Export a PSD once when preparing assets:

```sh
bun x mekuru-psd assets/source/sasara.psd --out assets/sasara
```

```text
character.psd (front to back)
├─ glass/
│  └─ glasses
├─ face/
│  ├─ smile
│  └─ angry
└─ body (raster layer)
```

- A top-level group with two or more direct children becomes an optional selection prop: `face?: "smile" | "angry"`.
- A group with one direct child becomes an optional boolean: `glass?: boolean`. Omitted or false means hidden; true means visible, regardless of the saved PSD visibility.
- Top-level raster layers are fixed artwork retaining their saved visibility. Do not wrap the entire character in another group.
- Selection defaults follow saved visibility. A hidden group or no visible child has no initial selection. Multiple visible children are an error.
- A child group is composited into one option using its internal visibility. Deeper groups do not create more props.
- Names are preserved verbatim. Property names must be JavaScript identifiers (Unicode, including Japanese, is supported). Reserved names: `id`, `at`, `len`, `children`, `source`, `key`, `ref`, `__proto__`, `constructor`, `prototype`.
- Empty groups, duplicate sibling names (including case-only differences), invalid portable filename characters, trailing spaces/dots, and Windows reserved filenames are rejected.

The output contains `group/option.png`, `layer.png`, `portrait.json` (stacking order, defaults, and asset references), and `portrait.d.ts` (the generated `LayerProps`). All PNGs retain the original canvas size and coordinates. Use a dedicated output directory. Re-export replaces generated files and removes obsolete PNGs recorded in the previous manifest; unrelated files are retained.

```tsx
import { psdPortrait } from "@mekuru/narrator";

import { Audio } from "@mekuru/audio";
import { readAudio } from "@mekuru/audio";
import type { LayerProps } from "./assets/sasara/portrait";

const Sasara = psdPortrait<LayerProps>({ src: "assets/sasara" });
<Sasara.Stand face="smile" glass />;
const Line = async () => {
  const source = await readAudio("assets/voice/line.wav");
  return <stack><Audio source={source} /><Sasara.Talk source={source} face="angry" /></stack>;
};
```

Adjust import paths to your script location. `Stand` also accepts `id`, `at`, and `len`; `Talk` accepts an audio `source` and renders only the portrait. Each call starts from the defaults, without inheriting previous selections. Position the character through `psdPortrait` options `x`, `y`, `w`, `h`, `z`, `rotate`, `anchor`, and `slot`. Compose captions with `Subtitle`.

Version 1 supports 8-bit RGB raster artwork, normal blending, opacity, and raster masks. Groups may use normal blending, or pass-through blending with full opacity and no mask. Adjustment layers, clipping, layer effects, vector masks, and other unsupported features fail with a layer path; rasterize/merge that artwork within an option first. Automatic blinking and lip sync are not part of this format. Existing YMM4-style `portrait()` remains available.

Nested groups also expand into same-named directories, including hidden source layers. Option groups additionally have a composite PNG for rendering (e.g. `face/smile.png` alongside `face/smile/linework.png`). Individual source PNGs bake their own masks and opacity; parent group effects are baked into the composite.

`Audio` and `readAudio` are provided by `@mekuru/audio`; `joinWavs` is provided by `@mekuru/audio/wav`.

## Caption intervals and SRT

`@mekuru/narrator/captions` provides pure `captionCues` and `toSrt` functions.
`captionCues(texts, frames)` partitions integer frames into contiguous intervals
`{ text, offset, frames }`, reserving one frame per cue and allocating the rest
by cumulative weights. Default weights count non-whitespace Unicode code points.
An optional `{ weights }` supplies project-specific weights; alternatively
`{ boundaries: [0, ..., frames] }` supplies every boundary. Boundaries must be
strictly increasing integers. Invalid or insufficient durations are rejected;
empty text arrays are valid only with zero frames.

```tsx
import { Subtitle } from "@mekuru/narrator";
import { captionCues, toSrt } from "@mekuru/narrator/captions";
import { compileTimeline, timelineIntervals } from "@mekuru/compiler/timeline";
const cues = captionCues(["First line", "Second\nline"], 90);
cues[cues.length - 1].frames += 15; // hold the final caption after allocation
const captions = <seq>{cues.map((cue, i) =>
  <dur id={`caption-${i}`} len={cue.frames}><Subtitle>{cue.text}</Subtitle></dur>
)}</seq>;
// Include captions in your document and write its XML before compiling.
const { timeline, diagnostics } = await compileTimeline(".mekuru/main.xml");
if (!timeline) throw new Error(JSON.stringify(diagnostics));
const absolute = cues.flatMap((cue, i) => {
  const matches = timeline.entries.filter(e => e.sourceId === `caption-${i}`);
  if (matches.length !== 1) throw new Error("Select a unique caption clock");
  return timelineIntervals(matches[0]).map(span => ({ ...span, text: cue.text }));
});
const srt = toSrt(absolute, timeline.fps);
```

SRT uses compiler-resolved absolute frames, rounds each boundary to milliseconds,
sorts by start time, and preserves multiline text. It rejects invalid intervals
or intervals that round to zero milliseconds. It does not infer audio duration.
Caption styles, IDs and text splitting remain project choices. To retain exact
legacy timing, pass its full boundaries instead of adopting the new allocator.
