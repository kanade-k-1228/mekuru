# @mekuru/core

[日本語](README.jp.md)

The Rust video compiler and preview server for Mekuru Movie Maker. One native executable watches XML, compiles scenes, serves HTTP/WebSocket and media, and contains the browser viewer. It also exports video through ffmpeg.

TSX types, the JSX runtime and XML output are provided by [@mekuru/types](../types/README.md).

```sh
bun add -d @mekuru/core
bunx mekuru-compiler .mekuru/main.xml --serve --run 'bun --hot src/main.tsx'
bunx mekuru-compiler .mekuru/main.xml -o video.mp4
```

Platform binaries are installed automatically. The npm command is a small Node/Bun launcher that selects the binary; all server behavior is Rust. `findCompiler` from `@mekuru/core/compiler` resolves `MEKURU_COMPILER`, then the platform npm package, then the newest local debug/release binary.

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
- `--no-open`: do not open a browser. `MEKURU_OPEN=0` does the same.

A missing XML file is allowed with `--run`. Compilation errors preserve the last successful scene. A save is accepted once two consecutive reads match; `/mnt/` is polled. Slow WebSocket readers receive a fresh snapshot when they fall behind. Asset URLs support HEAD and byte ranges; paths must resolve inside the project root.

## Export options

`--scale`, `--fps`, `--from`, `--to`, `--preset`, `--crf`, `--no-audio`, and `--preview` configure video export.

## Building

Use Rust 1.89 or later, a C linker and Bun for the UI build:

```sh
bun install
bun run build:release
./target/release/mekuru-compiler path/to/main.xml --serve
```

The viewer builds to `pkgs/core/viewer/` and `build.rs` embeds it. Rebuild the executable after UI changes. A release build fails if the UI is missing; a Rust-only debug build displays build instructions instead. CI embeds the UI in every platform binary before packaging.

See [XML syntax](../../docs/reference/Syntax.md) and [development](../../docs/dev/Developer.md).
