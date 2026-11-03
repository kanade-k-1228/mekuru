# @mekuru/narrator

[日本語](README.jp.md)

Shared components for building your own narrator from synthesized speech, a portrait, and subtitles. Provides subtitles and conversion of speech ruby notation into display text.

## Setup

Requires Bun 1.4 or later.

```sh
bun add -d @mekuru/core @mekuru/narrator
```

Set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/core"` in `tsconfig.json`. Install your speech engine and portrait package separately.

## Compose a narrator

This example also uses `@mekuru/voisona` and `@mekuru/portrait`. Replace `src` with your portrait folder.

```tsx
import type { At, Node } from "@mekuru/core";
import { Subtitle } from "@mekuru/narrator";
import { portrait, type Face } from "@mekuru/portrait";
import { Voisona } from "@mekuru/voisona";

const actor = portrait({ src: "assets/character/tsuzumi" });
type TsuzumiProps = { children?: Node; face?: Face; id?: string; at?: At };

export const TsuzumiStand = actor.Stand;
export const Tsuzumi = ({ children, face, id, at }: TsuzumiProps) => (
  <stack id={id} at={at}>
    <actor.Talk face={face}>
      <Voisona voice="suzuki-tsudumi_ja_JP">{children}</Voisona>
    </actor.Talk>
    <Subtitle color="#E0161E">{children}</Subtitle>
  </stack>
);
```

Place `<Tsuzumi>漢字《かんじ》を読みます。</Tsuzumi>` inside `<mekuru>`. Speech uses “かんじ”, while the subtitle shows “漢字”. To show an idle portrait, place `<TsuzumiStand />` in the scene's `<stack>`.

- The speech component owns synthesis, caching, and duration.
- [@mekuru/portrait](../portrait/README.md) owns expressions, lip sync, and idle portraits. Use `<image>` for a static portrait.
- Subtitles display a whole utterance. A `<stack>` lasts until its last timed child ends; an additional video can extend it. Use the existing `<dur>` element to control duration.

## Subtitle / SubtitleProps

`SubtitleProps` is `IntrinsicElements["text"]`: all native text placement, styling, and timing props are accepted.

Defaults: `x="50%"`, `y="95%"`, `anchor="b"`, `max-w="90%"`, `align="center"`, `size={54}`, white text, black stroke of width 7, and `z={100}`. Override any default through props.

```tsx
<Subtitle y="90%" size={48} stroke="#2E5E8C">
  ｜Mekuru《めくる》の字幕です。<br />Explicit line breaks are preserved.
</Subtitle>
```

Accepts strings, numbers, arrays, fragments, and `<br />`. Nullish values and booleans are ignored; other elements and components are rejected. Leading/trailing whitespace and whitespace around explicit breaks are trimmed as in speech. Reading dictionaries affect speech only. Width-based wrapping uses native `<text>` behavior; subtitles are not split into timed segments.

## subtitleText(children): Node

Converts ruby notation to display text while retaining `<br />`. Use it to build custom subtitles. This is a re-export of the same function from `@mekuru/speech`.

```tsx
import type { Node } from "@mekuru/core";
import { subtitleText } from "@mekuru/narrator";

const MySubtitle = ({ children }: { children?: Node }) => (
  <text x="50%" y="95%" anchor="b" size={48}>
    {subtitleText(children)}
  </text>
);
```

For multiple outlines, layer `Subtitle` components at the same position with different `stroke` and `stroke-width` values.
