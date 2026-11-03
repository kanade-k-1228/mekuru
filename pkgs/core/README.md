# @mekuru/core

[日本語](README.jp.md)

The Rust video compiler and preview server for Mekuru Movie Maker. One native executable watches XML, compiles scenes, serves HTTP/WebSocket and media, and contains the browser viewer. It also exports video through ffmpeg.

TSX types, the JSX runtime and XML output are provided by [@mekuru/types](../types/README.md), formerly `@mekuru/core`. Update authoring imports and `jsxImportSource` to `@mekuru/types`.

```sh
bun add -d @mekuru/core
bunx mekuru-compiler .mekuru/main.xml --serve --run 'bun --hot src/main.tsx'
bunx mekuru-compiler .mekuru/main.xml -o video.mp4
```

`@mekuru/core` replaces `@mekuru/cli`. Change that dependency and imports such as `@mekuru/cli/timeline` to `@mekuru/core/timeline`. Platform binaries are installed automatically. The npm commands are small Node/Bun launchers that select the binary; all server behavior is Rust. `mekuru-server <xml>` remains an alias for `mekuru-compiler <xml> --serve`. The old JavaScript `startServer` API is removed; spawn the native command or use Rust's `mekuru_compiler::server::start`.

The native executable can be copied and run directly without Node, Bun or a separate viewer folder:

```sh
mekuru-compiler project/main.xml --serve --no-open
```

Bun is still needed when your `--run` command authors XML using TSX. Video export and media analysis require ffmpeg/ffprobe; install fonts suitable for your script.

## Preview options

- `--serve`: watch XML and serve the embedded preview and timeline on loopback.
- `-p, --port <port>`: port, default 3333; use 0 to choose an available port.
- `--root <dir>`: asset and script working directory. Defaults to the XML folder, or its parent when that folder is `.mekuru`.
- `--run <command>`: run a shell command in the project directory. Stderr appears in the viewer until the next XML save. The server terminates the command and its child processes on shutdown.
- `--title <name>`: browser title, default the XML argument.
- `--no-open` / `--open`: control automatic browser opening. `MEKURU_OPEN=0`, `false`, `no` or `off` also disables it.

A missing XML file is allowed with `--run`. Compilation errors preserve the last successful scene. Saving uses two matching reads 10 ms apart; `/mnt/` uses a 500 ms polling fallback. Slow WebSocket readers receive a fresh snapshot when they fall behind. Asset URLs support HEAD and byte ranges; paths must resolve inside the project root.

## Export and machine output

- `--scale`, `--fps`, `--from`, `--to`, `--preset`, `--crf`, `--no-audio`, and `--preview` configure video export.
- `--emit-preview` emits standalone expanded preview JSON.
- `--emit-timeline` emits source IDs, integer frame intervals, repeat chains and diagnostics without drawing paths.
- `--preview-worker` retains the JSON Lines interface for tools and benchmarks. The native server calls the compiler in process and does not use IPC.

## Programmatic APIs

The Bun authoring adapter and its types are available from `@mekuru/core/timeline`:

```ts
import { compileTimeline, timelineIntervals } from "@mekuru/core/timeline";
const result = await compileTimeline(".mekuru/main.xml");
for (const entry of result.timeline?.entries ?? []) {
  console.log(entry.sourceId, timelineIntervals(entry));
}
```

`compileTimeline(xmlPath, { root? })` returns `{ timeline, diagnostics }`. Failed analysis has a null timeline. `timelineIntervals` expands nested repeats and clips the final round; it describes logical intervals, not slot visibility. `findCompiler` from `@mekuru/core/compiler` resolves `MEKURU_COMPILER`, then the platform npm package, then the newest local debug/release binary.

## Building

Use Rust 1.89 or later, a C linker and Bun for the UI build:

```sh
bun install
bun run build:release
./target/release/mekuru-compiler path/to/main.xml --serve
```

The viewer builds to `pkgs/core/viewer/` and `build.rs` embeds it. Rebuild the executable after UI changes. A release build fails if the UI is missing; a Rust-only debug build displays build instructions instead. CI embeds the UI in every platform binary before packaging.

See [XML syntax](../../docs/reference/Syntax.md) and [development](../../docs/dev/Developer.md).
