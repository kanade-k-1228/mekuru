# Design

[日本語](Concept.jp.md)

Mekuru builds explainer videos by arranging images and video around spoken lines. You write the script with TSX components; the compiler resolves timing and layout.

## Time and space

Containers arrange children along one axis and overlap them along the others. Sizes add up on the arranged axis; the largest child determines the size on overlapping axes.

- `<seq>`: Time
- `<row>`: Horizontal
- `<column>`: Vertical
- `<stack>`: None; overlap on all axes

Scene duration follows the length of speech and media. Elements without a duration, such as text and images, remain until their parent ends. `<dur>` sets a duration; `<repeat>` repeats until the parent ends. Neither changes spatial layout.

Time uses integer frames, rounding up fractions introduced by playback speed changes. Timing references form a dependency graph; cycles are errors. See the [element reference](Syntax.md) for rules and formulas.

## Processing

1. Bun runs TSX to generate speech audio and strict XML.
2. The compiler lays out the entire document and probes media duration.
3. It resolves start and end times, visible intervals, and source playback positions.
4. It renders frames, mixes audio, and encodes the video with ffmpeg.

Static drawing and audio processing are cached. Audio speed changes use ffmpeg's `atempo` to preserve pitch.

Preview uses the same timing, layout, and text paths. The compiler returns display data as JSON for the browser to render, without generating PCM audio or encoding video.
