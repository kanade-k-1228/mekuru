# Writing TSX

[日本語](Component.jp.md)

Bun runs the script and expands it into XML containing only built-in elements. Lowercase tags are [built-in elements](Syntax.md); uppercase tags are function components.

```text
src/main.tsx → .mekuru/main.xml → video.mp4
    Bun         mekuru-compiler
```

## Create a project

```sh
bun create @mekuru my-video --engine voisona
cd my-video
bun install
```

See [@mekuru/create](../../pkgs/create/README.md) for creation options and the [tutorial](../../example/README.md) (Japanese) for your first script.

- `src/main.tsx`: Script
- `src/parts.tsx`: Shared components, such as subtitles
- `assets/`: Images, video, and audio
- `configs/`: Upload settings and thumbnails
- `.mekuru/`: Generated XML and speech cache

## Scripts

`writeXml(path, video)` expands components and saves XML. Speech components emit a draft when audio is missing, then update it after synthesis. See [@mekuru/core](../../pkgs/core/README.md) for usage and JSX configuration, and [tutorial/main.tsx](../../example/tutorial/main.tsx) for a complete script.

Attributes accept numbers `{30}`, strings `"100%"`, booleans `closed`, and arrays `{[0, 80]}`. `false`, `null`, and `undefined` are omitted. Values are normalized in [XML](Syntax.md#xml-intermediate-format).

## Components

A component is a function that takes props and returns elements. It can be `async` and use arrays, conditionals, and fragments. Components have no hooks or state.

This component combines speech, a portrait, and subtitles into one line. Types and helper components are in [example/src/parts.tsx](../../example/src/parts.tsx).

```tsx
// Excerpt from example/src/parts.tsx
export const Tsuzumi = ({ children, face, show, ...time }: Line) => (
  <stack {...time}>
    <tsuzumi.Talk face={face}>
      <Voisona {...voice}>{children}</Voisona>
    </tsuzumi.Talk>
    <Subtitle>{children}</Subtitle>
    {show}
  </stack>
);
```

Audio inside `<stack>` sets the duration; subtitles, the portrait, and elements passed as `show` appear together. See [VoiSona Talk](../../pkgs/voisona/README.md) for speech and [portraits](Portrait.md) for animation.

### Displaying code

`<text pre>` preserves line breaks and spaces, removing common indentation and leading or trailing blank lines. See [Code and CodeMark in parts.tsx](../../example/src/parts.tsx) for line numbers and highlight frames. Line height is `size × line-height`.

## Preview

```sh
bun preview   # http://localhost:3333
```

Each save updates the preview and timeline. Errors appear in the browser, which keeps the last successful result.

- Play or pause: Space
- Move one frame: ← / →
- Move one second: Shift + ← / →
- Seek: Click or drag the timeline; click a clip to jump to its start
- Zoom: Bottom-right slider or Ctrl + wheel
- Resize: Drag the timeline's top edge; the setting is saved in the browser

Use `bun preview --no-open` to prevent the browser from opening automatically. Set `MEKURU_OPEN=0` to make this the default, or pass `--open` to open it for one run. In VS Code, select the displayed URL to open it in Integrated Browser.

Timing, layout, and text shaping match the export. Browser rendering and video seek precision may differ. Speed changes preserve pitch; sections outside the 1/16–16× range use seeking to follow the timeline.

## Export

```sh
bun run build                     # video.mp4
bun run build --preview           # Half resolution, 15 fps
bun run build --from 60 --to 90    # Seconds 60–90
```

`--preview` overwrites the same file. Export with the normal settings before uploading.

## Commands

In generated projects, `preview` runs `mekuru-server --run 'bun --hot src/main.tsx' .mekuru/main.xml`, and `build` runs `bun src/main.tsx && mekuru-compiler .mekuru/main.xml -o video.mp4`. See [@mekuru/cli](../../pkgs/cli/README.md) for options and the base directory for media paths.
