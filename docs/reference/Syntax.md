# Built-in elements

[日本語](Syntax.jp.md)

- Express videos with 18 tags, written as lowercase elements in a [TSX script](Component.md).
- `writeXml` expands components into XML containing only built-in elements (the [intermediate format](#xml-intermediate-format)).
- Relative media paths are resolved from the project folder ([commands](Component.md#commands)).
- Examples are TSX fragments placed inside `<mekuru>`. See the [tutorial](../../example/tutorial/main.tsx) and [explainer video](../../example/src/main.tsx) for complete scripts.

Tags:

- Root: `<mekuru>`
- Containers: `<seq>`, `<row>`, `<column>`, `<stack>`
- Timing: `<dur>` (set duration), `<repeat>` (repeat). Neither affects spatial layout
- Visuals: `<text>` (with `<br/>`), `<image>`, `<video>`, `<rect>`, `<circle>`, `<line>`
- Sound: `<audio>`
- Media playback: `<hold>` (pause), `<speed>` (change speed), `<cut>` (skip). All go inside `<video>` or `<audio>`

## Rules

Containers arrange children along one axis and overlap them along the others.

| Container  | Time       | Horizontal | Vertical   |
| ---------- | ---------- | ---------- | ---------- |
| `<seq>`    | Sequential | Overlap    | Overlap    |
| `<row>`    | Overlap    | Sequential | Overlap    |
| `<column>` | Overlap    | Overlap    | Sequential |
| `<stack>`  | Overlap    | Overlap    | Overlap    |

- Sequential: add durations or sizes. Overlap: use the longest or largest.
- [`<dur>`](#dur) and [`<repeat>`](#repeat) affect only time. For spatial layout, their children act as children of their parent.
- Elements either have a [duration](#duration) or have none. Those without one last until their parent ends. Unspecified dimensions stretch to the parent along overlapping axes.
- Any element can take timing attributes such as `at` and `fadein`, and appearance attributes such as `x`, `w`, `opacity`, and `z`.
- All times use integer frames: at `fps={30}`, 30 frames equal one second.
- Positions are resolved once for the whole video. A `<seq>` is sized to fit all its children.

## `<mekuru>`

- Wraps the whole video. Acts as a screen-sized `<seq>`; XML output wraps its children in one `<seq>`.
- `size`: screen dimensions, such as `"1920x1080"`.
- `fps`: frame rate, default 30. All times use frames at this rate.
- `font`: font name or font file path.
- For a background, place a full-screen `<rect>` first. Empty areas are black.

## Timing

### Duration

Whether an element has a duration depends on its tag and children. Elements without a duration last until their parent ends. They do not determine the parent's duration or advance a `<seq>`.

- `<video>`, `<audio>`: Media duration, including `<hold>`, `<speed>`, and `<cut>`
- `<text>`, `<image>`, `<rect>`, `<circle>`, `<line>`: None
- `<seq>`, `<stack>`, `<row>`, `<column>`: Has a duration if any child does. `<seq>` adds durations; others last until the last child ends
- `<repeat>`: None; requires content with a duration
- `<dur len={90}>`: 90 frames; also sets its children's duration to 90 frames

Two elements change whether content has a duration: [`<dur>`](#dur) gives it one; [`<repeat>`](#repeat) loops content that has one, producing an element without one.

Wrap scenes containing only text or shapes in `<dur>`. An empty `<dur len={9} />` creates a pause.

```tsx
// Excerpt from example/tutorial/main.tsx
<stack>
  <text x="50%" y="35%" anchor="center" size={90}>
    はじめての動画
  </text>
  <seq>
    <Zunda>こんにちは、ずんだもんなのだ。</Zunda>
    <Metan>今日は Mekuru で動画を作るわ。</Metan>
  </seq>
</stack>
```

- `<seq>` plays the two spoken lines in order.
- The heading has no duration, so it stays visible until `<seq>` ends.

### Timing attributes

- `id="intro"`: a reference name, unique within the document.
- `at`: start time.
  - `at={60}`: 60 frames after its position in the sequence. Inside `<seq>`, this follows the previous child with a duration; otherwise, it follows the parent's start.
  - `at="intro"`: start with `intro`, equivalent to `at="intro:0"`. Inside `<seq>`, use the later of the preceding child's end and `intro`'s start.
  - `at="clip:150"`: when `clip`'s clock reaches frame 150; see [`<hold>`](#hold).
    - For video and audio, this is source time within `from` to `to`. Positions skipped by [`<cut>`](#speedcut) refer to the instant of the cut.
    - For `<repeat>`, this counts frames from its start, without resetting each cycle.
- E504: the target ends before reaching the position, is not displayed, or the reference is outside the source range.
- E510: cyclic `at` references wait on each other.
- W550: the referenced time has already passed; start immediately at the sequence position.

### `<dur>`

- Sets a duration of `len` frames for itself and each direct child.
  - Content without a duration, such as text, images, or shapes, appears for `len` frames.
  - Content with a duration is trimmed or extended. Extended video holds its last frame; extended audio is silent.
  - All direct children overlap for `len` frames.
- Does not affect spatial layout. Its children act as children of its parent; wrapping items inside a `<row>` does not change their arrangement or `grow`.
- An empty `<dur len={9} />` creates a pause. Inside `<hold>`, it pauses the media for that many frames.
- E302: missing `len`.

### `<repeat>`

- Overlaps its contents in time like `<stack>`. One cycle lasts until the last child ends, then repeats until the parent ends.
- Has no duration. Wrap it in `<dur>` to repeat for a fixed number of frames and give it a duration.
- Does not affect spatial layout, like `<dur>`.
- Repeats media placed inside it, or the sequence inside a `<seq>`. Media with `<hold>`, `<speed>`, or `<cut>` plays the same way each cycle.
- `fadein` and `fadeout` on `<repeat>` apply to the entire run; on its contents, they apply each cycle.
- Repeats can be nested. Audio plays each cycle.
- E321:
  - No content has a duration.
  - Names are used inside the repeat: `id`, `slot`, or `at="id"`. Each cycle must behave identically. These attributes are allowed on `<repeat>` itself.

### `slot`

- A name available on any element.
- When elements with the same `slot` overlap, only the latest-starting element is drawn. Ties use the later element in document order.
- Audio is unaffected.

### `<hold>`

- Goes inside `<video>` or `<audio>`. Pauses the source at frame `at` until the hold's contents end.
- During the pause, video displays the same frame and audio is silent.
- The pause delays subsequent source positions and the media's end. Media with a duration set by `<dur>` still ends at that time.
- Like a container, it lasts until its last child ends and requires content with a duration. For a fixed pause, use `<hold at={150}><dur len={60} /></hold>`.
- Contents overlap like `<stack>` on the media's parent. Positioning, such as subtitles, and appearance, including `z`, `opacity`, and fades, are relative to the parent rather than the media.
- Holds at the same source position start together; playback resumes when the longest ends.
- If the parent trims the media, it also trims the hold's contents.
- `at="clip:150"` refers to the instant a hold at source frame 150 starts.
- E320: no duration; no child has one.
- E504: the position is outside the media's `from`–`to` range.
- E510: the contents wait for the media to advance beyond this hold.

Paths are relative to the project folder. This example pauses for 60 frames at source frame 150.

```tsx
<video id="life" src="assets/life.mp4">
  <hold at={150}>
    <dur len={60}><text>一時停止中</text></dur>
  </hold>
</video>
```

### `<speed>`・`<cut>`

- Go inside `<video>` or `<audio>`. Over the source range `from` to `to` in frames, `<speed>` plays at `rate` times the normal speed; `<cut>` skips it.
- `rate`: playback speed. `2` is double speed; `0.5` is half speed. Audio retains its pitch.
- `from` and `to` use source time. If omitted, they default to the start and end of the media's selected range. `<speed rate={2} />` doubles the speed of that entire range.
- Overlapping speeds multiply. A cut acts as infinite speed and skips overlapping regions too.
- The adjusted speed determines media duration unless `<dur>` overrides it, as well as times referenced by `at="clip:q"` and `<hold at>`. See `u` in the [formulas](#timing-calculation). Fractional frames round up.
- A position within a cut refers to the instant of the cut. A hold there freezes the first frame after the cut, where playback resumes.
- E303: `rate` is zero or negative.
- E314: `to` is less than or equal to `from`.
- E504: the range does not overlap the media's selected range.

```tsx
// Extended example using the example project's media
<video id="life" src="assets/life.mp4">
  <speed from={60} to={180} rate={2} />
  <cut from={240} to={300} />
</video>
```

- Frames 60–180 play in 60 frames; frames 240–300 are skipped. A 420-frame (14-second) source becomes 300 frames.
- `at="life:330"` is 210 frames after the video's start: 60 + 60 + 60 + 30.

### Fades, opacity, and layering

- `fadein` and `fadeout`: fade duration in frames. On containers, they affect all contents, including audio. Parent and child fades multiply.
- `opacity`: a value from `0` to `1` or a percentage such as `"50%"`. Parent and child values multiply.
- `z`: stacking order; larger values are in front. Defaults to the parent's value. Ties use document order, with later elements in front.

## Layout

### Container attributes

- `gap`: spacing between children in `<row>` and `<column>`.
- `justify`: alignment along the arranged axis in `<row>` and `<column>`.
- `wrap`: wrapping in `<row>` and `<column>`.
- `align`: alignment along overlapping axes. Defaults to `stretch`, filling the parent. Applies to both axes in `<stack>` and `<seq>`.
- `padding`: inner spacing, with one, two, or four values.
- `fill`, `stroke`, `stroke-width`, `radius`: background and border.
- Child `grow`: use remaining space. Use `<stack grow/>` to fill a gap.
- Layout is resolved in advance, so later-appearing children do not move other elements.

```tsx
<row gap={16}>
  <rect w={80} h={80} fill="#7FD1AE" />
  <circle w={80} h={80} fill="#E8A33D" />
</row>
```

### Visual elements

- `<text>`: text.
  - Place text inside `<text>`. Escape `<` and `&` as `&lt;` and `&amp;`.
  - Use `<br/>` for a line break.
  - `w` and `max-w` set wrapping width. `align="center"` centers text.
  - `color`: text color. `stroke` and `stroke-width`: text outline. `background`, `radius`, and `padding`: text background.
  - `pre`: preserve source line breaks.
- `<image src>`: image. Setting only `w` or `h` preserves aspect ratio; setting both fits the image inside that box.
- `<rect>`: rectangle.
- `<circle>`: circle, or an ellipse when `w` and `h` differ.
- `<line p>`: connected points, such as `p="0:0,100:50,50%:100%"`. Use comma-separated `x:y` pairs in pixels or percentages.
  - `closed`: connect the last point to the first, making a polygon.
  - `fill`: fill the interior. A closed line with only `fill` has no outline.
  - `head`: arrowheads at `start`, `end`, or `both`.
  - `dashed` and `dotted`: dashed or dotted lines.
- Shapes without `fill` or `stroke` use a white outline.

```tsx
<line p="0:0,100:50,50%:100%" head="end" stroke="#FFFFFF" />
```

### Position and size

- `x` and `y`: position from the top-left corner inside the parent's padding. Setting them removes the element from automatic arrangement.
- `anchor`: the point placed at `x` and `y`, such as `tl` (top left), `c` (center), or `b` (bottom center).
- `w` and `h`: width and height. `min-w`, `max-w`, `min-h`, and `max-h` set limits.
- `rotate`: angle in degrees, positive clockwise. Rotates the element and its contents around its center without affecting layout.
  - To rotate a `<line>`, place it inside a rotated container.
  - E322: `<video>` and containers holding it cannot be rotated.
- Value formats:
  - Dimensions: pixels, such as `{100}`, or `%` of the parent's inner size.
  - Time: nonnegative integer frames. `{45}` is 1.5 seconds at `fps={30}`.
  - Colors: `#7FD1AE` or `white`.
  - Booleans: a bare attribute such as `closed` means `true`.

## `<video>`・`<audio>`

- `src`: required source path.
- `from` and `to`: selected source range in frames.
- `volume`: audio volume, such as `0.5` or `"50%"`. `0` mutes it.
- To loop, wrap in [`<repeat>`](#repeat).
- Extending with [`<dur>`](#dur) holds the video's last frame and adds silence to audio.
- Place [`<hold>`](#hold) inside to pause, or [`<speed>` and `<cut>`](#speedcut) to change speed or skip sections.
- `label`: timeline description for `<audio>`.
- `<video>` sizing follows `<image>`: preserve the source aspect ratio; without `w` or `h`, use the source dimensions, shrinking to fit if necessary.
- `<audio>` takes no space, including in a `<row>`.
- Speech components also produce `<audio>`: [VOICEVOX](../../pkgs/voicevox/README.md), [COEIROINK](../../pkgs/coeiroink/README.md), [Style-Bert-VITS2](../../pkgs/style-bert-vits2/README.md), and [VoiSona Talk](../../pkgs/voisona/README.md).

```tsx
// Excerpt from example/src/main.tsx
<repeat fadein={30} fadeout={60}>
  <audio src="assets/bgm.mp3" volume={0.06} />
</repeat>
```

- Background music in `<repeat>` has no duration and loops until the video ends. Put fades on `<repeat>` to apply them to the whole run.
- Sound effects have a duration. Inside `<seq>`, they play after the preceding line and delay the next one.

## XML (intermediate format)

- `writeXml` writes `.mekuru/main.xml`; `mekuru-compiler` reads it. It is not intended for manual authoring.
- XML fills in TSX omissions and uses one canonical form for values. Other forms are errors, without silent correction.
- Attribute names match TSX, including `stroke-width`.

TSX → XML:

- Root: Children of `<mekuru>` run in order → One `<seq>` inside `<mekuru>`
- Start: `at={60}`, `at="intro"`, `at="clip:150"` → `delay="60"`, `at="intro:0"`, `at="clip:150"`; if delay and reference are both present, use the later time
- Time (frames): `{45}` → `45`
- Fractions (`opacity`, `volume`): `{0.5}`, `"50%"` → `0.5`
- Color: `white`, `#7FD1AE` → `#FFFFFF`, `#7FD1AE`; hexadecimal only
- Boolean: `closed` → `closed="true"`; omit `false`
- `anchor`: Also accepts `center`, `top`, `bottom`, `left`, `right` → `tl`, `t`, `tr`, `l`, `c`, `r`, `bl`, `b`, `br`
- `grow`: Bare `grow` or a number → Number
- `padding`: `{[0, 80]}` → `"0 80"`
- Draft speech: Emitted by speech components → `<dur len="…"><audio draft="true" label="…"/></dur>` wraps durationless audio in an estimated duration. Preview only

## Timing calculation

Each element's start `s` and end `e` follow these formulas. Elements without a duration have no `e`.

```text
s(X) = max( p(X) + a, T(Y, q) )      at={a} or at="Y:q"; omitted a is 0; omit the T term if absent
p(X) = s(parent)                     parent is not <seq>, or X is its first child
     = max( p(prev), e(prev) )        parent is <seq>; prev is the preceding sibling
                                     use p(prev) if prev has no duration
e(X) = s(X) + d                      <dur len={d}> and its direct children
     = T(X, to)                      video/audio; also wait for holds at to
     = max( s(X), e(C) … )           containers and <hold>; C has a duration
T(Y, q) = s(Y) + q                   non-media elements
        = max( s(Y) + ⌈u(from, q)⌉, e(H) + ⌈u(q_H, q)⌉ … )
                                     video/audio; H is a hold at q_H < q
u(a, b) = ∫ dq / r(q), from a to b    frames to play source range a–b; r is playback speed
s(H) = T(M, q_H)                     <hold at={q_H}>; M is its video/audio
Visible end E(X) = min( e(X), E(parent) )
                                     use E(parent) if X has no duration
                                     a hold's parent is its video/audio
Visible interval = [ s(X), E(X) )
```

- Times, durations, and source reference positions are integer frames. Only `u` is real-valued; `⌈ ⌉` rounds up.
  - Since `s` and `e` are integers, `⌈max(a, b)⌉ = max(⌈a⌉, ⌈b⌉)` and `⌈n + x⌉ = n + ⌈x⌉` make `T(Y, q)` the first frame at which the source reaches `q`.
  - Convert source duration in seconds to frames by multiplying by `fps`. If `to` is omitted, the media ends at that duration. Rounding up preserves the end of the audio.
- `T(Y, q)`: the time when `Y`'s clock reaches `q`. Video and audio use source time, delayed by [`<hold>`](#hold). Other elements count frames from their start.
- `r(q)`: playback speed at source position `q`. Normally 1; inside [`<speed>`](#speedcut), use `rate` and multiply overlaps; inside [`<cut>`](#speedcut), use ∞, consuming no time. Without speed changes, `u(a, b) = b − a` remains an integer.
- A media clock behaves like a `<seq>` alternating source playback and holds: play from `from` to `q₁` → hold → play to `q₂` → … . Each playback segment has duration `u`.
- With only integer `max` and `+` operations, timing is the longest path through the dependency graph. Delaying one event cannot make another earlier. Cycles prevent resolution and produce E510.
