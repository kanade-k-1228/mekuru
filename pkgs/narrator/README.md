# @mekuru/narrator

[日本語](README.jp.md)

Shared components for building your own narrator from synthesized speech, a portrait, and subtitles. Provides portraits, blinking, lip sync, subtitles, and PSD asset preparation.

## Setup

Requires Bun 1.4 or later.

```sh
bun add -d @mekuru/types @mekuru/narrator
```

Set `jsx: "react-jsx"` and `jsxImportSource: "@mekuru/types"` in `tsconfig.json`. Install your speech engine separately and provide portrait image assets.

## Compose a narrator

This example also uses `@mekuru/voisona` and `@mekuru/speech`. First export a PSD containing a `face [select]` group with `mekuru-psd`. Replace `src` with the exported folder.

```tsx
import type { At, FC, Node } from "@mekuru/types";
import { portrait, Subtitle } from "@mekuru/narrator";

import { Audio } from "@mekuru/audio";
import { Voisona } from "@mekuru/voisona";

import type { LayerProps } from "./assets/character/tsuzumi/portrait";

const actor = portrait<LayerProps>({ src: "assets/character/tsuzumi" });
type TsuzumiProps = { children?: Node; face?: LayerProps["face"]; id?: string; at?: At };

export const TsuzumiStand = actor.Stand;
export const Tsuzumi: FC<TsuzumiProps> = async ({ children, face, id, at }) => {
  const line = await Voisona.prepare({ voice: "suzuki-tsudumi_ja_JP", children });
  return (
    <dur len={line.audio.len} id={id} at={at}>
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
- `prepare` expands the text once and returns display text and a shared audio source. `line.audio.len` is the source duration. The outer `<dur>` fixes the line interval even when decorations are added.

## Portraits and lip sync

`portrait<LayerProps>({ src, ...options })` reads exported Mekuru PSD assets. `Stand` supplies idle animation; `Talk` uses the shared audio source for duration and lip sync. PSD groups explicitly declare `[fixed]`, `[toggle]`, `[select]`, `[blink]` or `[lip]`. Part names are unrestricted by body-part conventions, and generated props select expressions.

Use `blink` for the average blinking interval and `x`, `y`, `w`, `h`, `z`, `rotate`, `anchor`, `slot` for placement. See [the PSD convention and converter guide](../../docs/reference/Portrait.md).

## Subtitle / SubtitleProps

`SubtitleProps` is `IntrinsicElements["text"]`: all native text placement, styling, and timing props are accepted.

Defaults: `x="50%"`, `y="95%"`, `anchor="b"`, `max-w="90%"`, `align="center"`, `size={54}`, white text, black stroke of width 7, and `z={100}`. Override any default through props.

```tsx
<Subtitle y="90%" size={48} stroke="#2E5E8C">
  Mekuru の字幕です。<br />Explicit line breaks are preserved.
</Subtitle>
```

`Subtitle` expands children exactly like `<text>`. It does not trim whitespace, and `<br />` and `pre` are passed through. Ruby notation stays in the XML as written; as in every `<text>`, the compiler shows only the base text (`漢字《かんじ》` appears as “漢字”). For speech, pass `line.display`.

For multiple outlines, layer `Subtitle` components at the same position with different `stroke` and `stroke-width` values.

## Prepare and convert portraits

```sh
bun x mekuru-psd assets/source/character.psd --out assets/character
# For an existing PSD with different conventions:
bun x mekuru-psd-convert source.psd --inspect
bun x mekuru-psd-convert source.psd --map mapping.json --out character.psd
```

The converter maps explicitly selected layers into a native PSD, flattening each part/frame. It never changes the source. Export the resulting PSD with `mekuru-psd` and use the same `portrait()` runtime. See the [mapping format](../../docs/reference/Portrait.md#convert-an-existing-psd-including-ymm4-artwork).
