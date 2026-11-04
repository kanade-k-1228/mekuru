# Portraits

[日本語](Portrait.jp.md)

`@mekuru/narrator` prepares portraits from Mekuru-convention PSD files, with expression selection, blinking, and volume-driven lip sync. Video generation reads only exported PNGs and `portrait.json`.

## PSD convention

Name each top-level layer or group `name [kind]`. Do not wrap the entire character in another group. PSD stacking order determines drawing order; body-part names have no special meaning.

| Kind | Contents | Generated prop |
| --- | --- | --- |
| `[fixed]` | Fixed image or composite group | None |
| `[toggle]` | Image or composite group with switchable visibility | boolean |
| `[select]` | Group whose direct children are alternatives | Option name or null |
| `[blink]` | Group of blinking expressions | Option name or null |
| `[lip]` | Group of speaking expressions | Option name or null |

```text
character.psd (front to back)
├─ glasses [toggle]
├─ eyes [blink]
│  ├─ normal
│  │  ├─ 2   (open)
│  │  ├─ 1   (half open)
│  │  └─ 0   (closed)
│  └─ smile (static image)
├─ mouth [lip]
│  └─ normal
│     ├─ 1
│     └─ 0
├─ clothes [select]
│  ├─ casual
│  └─ formal
└─ body [fixed]
```

Parentheses above are explanations, not part of the names. Frame names contain only digits.

- Select options may be images or groups, composited using their internal visibility. A single option is still a selection, not a toggle.
- Blink/lip options may be static images or frame groups. Frames must be named consecutive integers starting at `0`, closed to open, regardless of stacking order. One frame is static. Each frame may itself contain ordinary artwork groups.
- Defaults follow saved visibility. Multiple visible alternatives are an error; a hidden parent or no visible alternative means null. Toggles also use saved visibility. Each call starts from defaults, without remembering earlier calls.
- Names become prop names and filenames. Prop names must be JavaScript identifiers, including Japanese. Reserved: `id`, `at`, `len`, `children`, `source`, `key`, `ref`, `__proto__`, `constructor`, `prototype`. Part/option names must be unique among siblings, ignoring case. Path separators, trailing spaces/dots and Windows reserved filenames are rejected.

Supported artwork: 8-bit RGB raster layers, normal blending, opacity and basic raster masks. Pass-through groups require full opacity and no active mask. Adjustment layers, clipping, layer effects, vector masks and other unsupported features report the offending layer. Rasterize/merge such artwork within each part or frame first.

## Export assets

```sh
bun x mekuru-psd assets/source/character.psd --out assets/character
```

The equivalent API is `exportPsd(input, output)` from `@mekuru/narrator/psd`. PNGs preserve canvas dimensions and coordinates:

- Fixed/toggle: `body.png`
- Static option: `clothes/casual.png`
- Animation: `eyes/normal/0.png`, `eyes/normal/1.png`, etc.
- `portrait.json`: version 2, back-to-front parts, kinds, defaults and closed-to-open image arrays per option
- `portrait.d.ts`: generated `LayerProps`

Only renderable parts/options/frames are exported, not individual internal linework layers. Keep the PSD as the editable source. Use a dedicated output folder. Re-export removes obsolete images recorded in the previous manifest and preserves unrelated files.

## Use a portrait

```tsx
import type { FC } from "@mekuru/types";
import { portrait } from "@mekuru/narrator";
import { Audio, readAudio } from "@mekuru/audio";
import type { LayerProps } from "./assets/character/portrait";

const actor = portrait<LayerProps>({ src: "assets/character", x: "80%" });
const Line: FC = async () => {
  const source = await readAudio("assets/voice/line.wav");
  return <stack>
    <actor.Stand />
    <Audio source={source} />
    <actor.Talk source={source} eyes="normal" mouth="normal" />
  </stack>;
};
```

Place `Line` inside `<mekuru>`. For synthesis, pass `line.audio` from `Voicevox.prepare(...)` or another engine instead of `readAudio`. `Talk` does not play audio itself.

`Stand` accepts `id`, `at`, and `len`. `Talk` displays the portrait for the shared audio source's duration. A speaking portrait temporarily replaces an idle portrait with the same `slot`. Mouths remain closed during idle, draft, silence, and the tail after audio. Eyes blink even in drafts. Identical inputs produce reproducible motion.

Placement: `x`, `y`, `anchor`, `w`, `h`, `z`, `rotate`; defaults are bottom center, 80% height. The default slot is `portrait:<src>`; choose different slots for multiple instances of the same art. `blink` is the average interval in integer frames (default: four seconds); false or zero disables blinking. Define multi-part expression presets as ordinary objects or TSX wrappers in your project.

## Convert an existing PSD, including YMM4 artwork

```sh
bun x mekuru-psd-convert source.psd --inspect
bun x mekuru-psd-convert source.psd --map mapping.json --out character.psd
bun x mekuru-psd character.psd --out assets/character
```

Inspection emits JSON with exact layer paths, local visibility (not ancestor visibility), group status, blending and opacity, ordered back to front. Mapping is explicit; `!` and `*` below are literal source names, not interpreted syntax.

```json
{
  "version": 1,
  "layers": [
    { "name": "body", "kind": "fixed", "initial": true, "source": ["体"] },
    {
      "name": "eyes", "kind": "blink", "initial": "normal",
      "options": [
        { "name": "normal", "frames": [["!目", "*閉じ"], ["!目", "*半開"], ["!目", "*開き"]] }
      ]
    }
  ]
}
```

- List `layers` back to front. Fixed/toggle entries have `source` and a boolean `initial`.
- Select/blink/lip entries have `options` and an option-name or null `initial`. Each select option has one frame; animated options have one or more frames ordered closed to open.
- Source paths are arrays of names starting at the root. The selected node itself may be hidden. Groups composite their internally visible children.
- Missing or ambiguous paths fail. A referenced node cannot be detached from ancestors with changed opacity, active masks or special blending; merge artwork with those effects first.
- The source remains untouched. Each output part/frame becomes a composited raster layer in a native PSD, including a composite preview. Edit fine linework in the source and rerun the same mapping. Re-running updates the output file.
- The same raster subset as native export applies. YMM4 configuration files, inferred body-part naming and PSDTool-specific behavior are not interpreted.

APIs: `inspectPsd(input)` and `convertPsd(input, output, mapping)` from `@mekuru/narrator/psd-convert`.

## Migration

Replace `psdPortrait` with `portrait<LayerProps>`, annotate top-level names and re-export. To preserve the old initially-hidden behavior of a one-child group, label it `[toggle]` and hide it in the PSD.

Version 1 manifests are rejected at runtime; only re-export cleanup reads their generated file lists. YMM4 animated-portrait folders, INI files and the old `Face`/`faces` API are removed. Convert the original PSD, or assemble existing parts into a PSD using the new convention.
