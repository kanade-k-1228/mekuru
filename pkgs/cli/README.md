# @mekuru/cli

[日本語](README.jp.md)

Preview and video export commands. Requires Bun 1.4+, ffmpeg, ffprobe, and fonts for the script.

```sh
bun add -d @mekuru/cli
bunx mekuru-server .mekuru/main.xml --run 'bun --hot src/main.tsx'
bunx mekuru-compiler .mekuru/main.xml -o video.mp4
```

- `mekuru-server <xml>`: Watch XML and open the browser viewer.
- `--run <cmd>`: Run the command that generates XML.
- `--port`, `--title`: Port (default: 3333) and browser title.
- `--no-open`, `--open`: Control browser launch. Default: open, unless `MEKURU_OPEN=0`.
- `mekuru-compiler <xml>`: Export video with the native compiler.
- `-o <file>`: Output file.
- `--preview`: Half resolution, 15 fps.
- `--scale`, `--fps`: Resolution multiplier and frame rate.
- `--from`, `--to`: Export range in seconds.
- `--preset`, `--crf`: x264 encoding settings.
- `--no-audio`: Export without audio.

Both commands accept `--root <dir>` for the media base directory. Default: the XML directory, or its parent when named `.mekuru/`.

Compiler lookup: `MEKURU_COMPILER` → platform npm package → newest local `target/debug` or `target/release` binary (debug wins ties). `@mekuru/protocol` exports the server/viewer types.

[TSX workflow](../../docs/reference/Component.md) · [Development](../../docs/dev/Developer.md).

## Programmatic APIs

Use `findCompiler` from `@mekuru/cli/compiler` and `startServer` from
`@mekuru/cli/server`; importing these modules does not start a command.
Use the `mekuru-compiler` and `mekuru-server` commands for ordinary scripts.

```ts
import { compileTimeline, timelineIntervals } from "@mekuru/cli/timeline";
const result = await compileTimeline(".mekuru/main.xml");
if (!result.timeline) throw new Error(JSON.stringify(result.diagnostics));
const timeline = result.timeline;
const entries = timeline.entries.filter(e => e.sourceId === "caption-1");
// IDs are unique within a clock, not across repeat bodies. Select the intended
// clock through parent links if the same sourceId occurs more than once.
const intervals = entries.flatMap(timelineIntervals);
```

The compiler's `--emit-timeline` returns `{ timeline, diagnostics }`, without
paths, PCM conversion or encoding. Layout and media inspection still run.
Frames are integers and intervals are half-open. `fps` is `{ num, den }`;
`frames` is the total duration. Entries include all schedule nodes and elements,
including anonymous parents. Internal `id` values are local to one compilation;
`sourceId` preserves the authored ID. Repeat chains describe the first round's
coordinates; `timelineIntervals` expands only the selected entry into absolute
intervals, clipping the final round. These are logical intervals, not slot or
opacity visibility. Draft audio sets `estimated: true`. Compilation errors
return a null timeline; process and response failures throw. Render options
cannot be combined with `--emit-timeline`.

### npm-installed FFmpeg

An optional launcher can use the paths supplied by `ffmpeg-static` and
`ffprobe-static` (install both in the video project). No symlinks are needed:

```ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static") as string | null;
const ffprobe = (require("ffprobe-static") as { path: string }).path;
if (!ffmpeg) throw new Error("FFmpeg is unavailable on this platform");
process.env.MEKURU_FFMPEG ??= ffmpeg;
process.env.MEKURU_FFPROBE ??= ffprobe;
// Child processes inherit these variables. Direct FFmpeg calls should use
// process.env.MEKURU_FFMPEG as their executable, too.
const child = Bun.spawn(["mekuru-server", "--run", "bun --hot src/main.tsx", ".mekuru/main.xml"],
  { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
```

The preview server sends separate SSE `preview` (`{ version, preview }`) and
`state` events. A connection receives the last successful preview followed by
state. Builds and errors send state only; `/api/state` also contains no preview.
Upgrade compiler, CLI and viewer together when migrating from the combined event.
