# Portraits

[日本語](Portrait.jp.md)

`@mekuru/portrait` layers images in YMM4's animated portrait format, with blinking, expressions, and lip sync driven by audio volume.

```sh
bun add -d @mekuru/portrait
```

## Image folders

Place image parts of the same dimensions inside the project. PNG, JPEG, and WebP are supported; use transparent images for overlays. For PSD files, merge the layers for each part and export them as PNG.

```text
assets/character/sasara/
  体/    基本.png  指差し.png
  目/    基本.png  基本.0.png  基本.1.png  笑い.png
  口/    基本.png  基本.0.png  基本.1.png  笑い.png
  眉/    基本.png
  顔色/  ほんのり.png
  他/    ハート.png
```

- Draw order, back to front: `後 → 体 → 顔色 → 髪 → 口 → 目 → 眉 → 他` (back, body, face tint, hair, mouth, eyes, eyebrows, extras). Use these Japanese folder names.
- For eyes and mouths, `名前.0.png` is closed. Numbered frames open in order, with `名前.png` fully open. Without `.0`, the part is static; without `名前.png`, it is ignored.
- `opacity=0.5` in `髪/名前.ini` redraws that hair above the eyebrows at half opacity.
- Filenames containing `.` outside the numbered sequence, such as `名前.a.png`, are ignored.

## Usage

Define a component in `src/parts.tsx` and place `<Scene />` inside the script's `<mekuru>`. This example uses the [example assets](../../example/README.md#解説役の立ち絵) (Japanese guide).

```tsx
import { portrait } from "@mekuru/portrait";
import { Voicevox } from "@mekuru/voicevox";

const actor = portrait({
  src: "assets/character/sasara",
  faces: { 笑顔: { 目: "笑い", 口: "笑い" } },
});

export const Scene = () => (
  <stack>
    <actor.Stand />
    <actor.Talk face="笑顔">
      <Voicevox speaker="冥鳴ひまり">こんにちは。</Voicevox>
    </actor.Talk>
  </stack>
);
```

`Stand` remains until its parent ends. `Talk` takes one speech component or `<audio>` and replaces the `Stand` in the same `slot` during playback. The mouth follows WAV volume and stays closed in drafts.

## Options

- `src`: Image folder, relative to the project
- `x`, `y`, `anchor`, `w`, `h`, `z`: Same as `<image>`. Default: bottom center, 80% height
- `face`: Base parts. If omitted, use the first name in sorted order for `体`, `髪`, `目`, `口`, and `眉`, preferring animated eyes and mouths. No `顔色`, `他`, or `後`
- `faces`: Named expressions, specifying differences from the base parts
- `blink`: Average blink interval in frames. Default: 4 seconds. `false` disables blinking
- `slot`: Replacement identifier. Default: `portrait:<src>`. Use separate slots for copies at different positions

Set `face` on `Stand` or `Talk` to an expression name or a set of parts. `null` hides a part. `他` and `後` accept arrays of up to three parts, with earlier entries in front. Unknown names are errors. `Stand` also accepts `id`, `at`, and `len`.

## Differences from YMM4

Lip sync uses volume, without vowel-specific images. GIF and video parts, and blend modes from `顔色` `.ini` files, are unsupported.
