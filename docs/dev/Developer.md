# Development

[日本語](Developer.jp.md)

## Repository structure

- [pkgs/types](../../pkgs/types/README.md): TSX types, JSX runtime, and XML output
- [pkgs/core](../../pkgs/core/README.md): Rust video compiler, native preview server, embedded UI and npm launchers
- [pkgs/viewer](../../pkgs/viewer/README.md): React viewer, built into `pkgs/core/viewer/`
- [pkgs/create](../../pkgs/create/README.md): Project generator
- [pkgs/speech](../../pkgs/speech/README.md): API for implementing speech components
- `pkgs/voicevox`, `coeiroink`, `style-bert-vits2`, `voisona`: Speech engine integrations
- [pkgs/narrator](../../pkgs/narrator/README.md): Portraits, lip sync, subtitles, and PSD preparation for custom narrators
- `pkgs/youtube`, `niconico`: Upload commands
- [example](../../example/README.md): Tutorial and explainer video (Japanese)
- [scripts/release.ts](../../scripts/release.ts): Release versioning, packaging, and dependency setup

## Build

Use the Bun version specified by the root `packageManager`, Rust 1.89 or later, and a C linker. On Ubuntu, install `build-essential` for the linker.

```sh
bun install
bun run build                     # Viewer and development compiler
bun run build:release             # Optimized build
bun run --cwd example preview     # Example
```

- `bun run typecheck`: TypeScript type checking
- `bun run test`: Bun and Rust tests
- `bun run check`: Biome, types, rustfmt, and clippy
- `bun run fmt`: Formatting and automatic fixes with Biome and rustfmt

`bun build` and `bun test` are Bun's own commands. Use `bun run` to invoke the root scripts.

TypeScript packages run directly from source and need no rebuild after changes. After compiler changes, run `cargo build --workspace --locked`; after viewer changes, run `bun run build` to embed the new UI. See [core](../../pkgs/core/README.md) for compiler lookup order.

For viewer development, start these in separate terminals:

```sh
bun run --cwd example preview --no-open
bun run --cwd pkgs/viewer dev
```

The development server at `http://localhost:5173` proxies API requests to port 3333.

TypeScript configuration lives at the root and in the viewer. Generated projects use `pkgs/create/template/tsconfig.json`. There are no Project References, incremental builds, or per-package JS/type declaration outputs. Type checking can run before building. `bun run test` builds the native binary and UI before the server integration tests.

## Releases

Merge normal changes into `main` through a PR from a working branch. Versions come from Git tags without a `v` prefix; versions in the repository stay at `0.0.0`. All packages share a release version. Before 1.0, increment minor for features or breaking changes, and patch for fixes.

```sh
git switch main
git pull
git tag 0.3.0
git push origin 0.3.0
```

[packages.yml](../../.github/workflows/packages.yml) runs checks, verifies Rust 1.89 support, and builds and smoke-tests eight platforms: Linux (glibc and musl) and macOS on x64 and arm64, and Windows on x64 and arm64. Tags use release builds; other runs use debug builds. Dependencies use `bun ci`, with Bun's version taken from `packageManager`.

Publishing a tag:

1. `release.ts stamp` sets the version in manifests and lockfiles without committing the changes.
2. Each platform job builds the viewer, embeds it in the Rust executable, and `pack` creates compiler npm tarballs.
3. `deps` sets `@mekuru/core`'s `optionalDependencies`; publish the binaries and public workspaces with `bun publish`. Exclude `private` packages.
4. Create a GitHub Release with release notes.

Only publishing steps pass `NPM_TOKEN` as `NPM_CONFIG_TOKEN`. Tags such as `0.3.0-rc.1` use npm's `next` tag and GitHub prereleases. Do not publish from a local machine.

A failed workflow can be rerun. `--tolerate-republish` handles versions already published. `release.ts` rejects release preparation with version `0.0.0`. To patch an older version, branch from its tag and increment patch.

## How preview works

`mekuru-compiler <xml> --serve` runs a Tokio/Axum HTTP server, filesystem watcher and a dedicated compiler thread in one process. The compiled viewer is embedded in the executable. `@mekuru/core` replaces the separate CLI package; `mekuru-server` is an npm alias that launches the same native executable. No Bun process or worker IPC is needed to preview existing XML. `--run` still executes the user's authoring command in the project folder.

Scenes and drawing resources are shared with Arc, and only the latest pending XML is compiled. The compiler thread keeps the existing font, media, drawing and identity caches. HTTP and file streams remain asynchronous while compilation runs. `--emit-preview`, `--emit-timeline` and the tool-facing `--preview-worker` protocol remain available.
- File notifications settle through two matching reads 10 ms apart, normally about 20 ms after the last notification. New notifications invalidate in-flight reads; transient read errors retry up to three times. Atomic replacements and quick chunked writes are coalesced. The existing 500 ms polling fallback under `/mnt/` still applies.
- Parsing, layout and timing run over the entire input. Font books, text measurements, media metadata and `ViewOp` drawing conversions are reused. A resource is one original `ViewOp`, even when the compiler merges many operations into one display element.
- The drawing LRU has a 64 MiB estimated-size budget; each of up to four font books has 4 MiB of measurements and 16 MiB of glyph outlines. Probe and image-dimension LRUs each have a 1 MiB budget. The worker also retains at most the acknowledged scene and one candidate, sharing drawing resources through Arc. These scenes, active response data and the font system's own storage are additional. File keys include path, size and modification time; font-file dependencies are preloaded and validated before layout. Diagnostics always use the current formatted XML's line numbers.
- Sequential IR IDs are preserved. Separate preview keys match scoped XML IDs, then unchanged sibling subtrees, then equal-length same-tag gaps. Ambiguous insertions/deletions get new keys; a worker restart gets a fresh key namespace. Rendering order is independent of identity.
- Compilation is sequential. A result is published only if it still matches the newest accepted XML version; discarded results never advance the diff base. Recoverable compiler panics reset caches and retry once. A failed compilation retains the last successful scene.
- `/api/ws` sends one JSON text message per WebSocket message: `snapshot` on connection, `status` for building/errors/diagnostics alone, and versioned `patch` messages for successful changes. Rust selects the smaller update and serializes it once for all subscribers. A bounded 64-event queue resynchronizes lagging subscribers with a snapshot. Clients can send `{"type":"resync"}` to request one on the same connection. Ping/Pong detects lost connections; the viewer reconnects after one second. `/api/preview` returns the current snapshot and `/api/state` returns status only.
- `/files/` streams media and fonts with HEAD and byte-range support. Canonical paths, including symlink targets, must remain inside the project root. `--run` stderr is bounded, cleared after XML saves, and its process tree is stopped on server shutdown.
- The viewer applies each patch atomically, preserving unchanged element and resource objects. A version mismatch or missing resource requests a snapshot over the same WebSocket; a three-second resync timeout reconnects. The server and viewer retain the resources referenced by their current scenes. Status changes leave interval indexes and timeline layout intact; playback and zoom persist, with stored playback time clamped when duration shrinks.
- Wrap draft speech in a `<dur>` with an estimated duration. Video export requires completed audio. Pass `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=1` to `--run` to preserve reload logs.

Preview text uses HTML/CSS from compiler-resolved positions, widths and styles; shapes and images use SVG, and media uses browser elements. Text width, wrapping and outlines can differ from export. Explicit and project-default font files inside the project load through `/files/` with a revision in the URL; unavailable or loading fonts use a fallback. The browser shares faces by source and revision and releases the last mounted reference. Export retains Rust shaping and glyph paths. The glyph cache described above is used by export, not HTML preview.

Single-shot preview, resident preview and `--emit-timeline` share analysis. Preview diagnostics refer to formatted XML; timeline diagnostics refer to the input XML. The frame-based timeline and caption APIs are documented in [core](../../pkgs/core/README.md#programmatic-apis) and [narrator](../../pkgs/narrator/README.md). Timeline source IDs and preview reconciliation keys serve separate purposes.

Asset-only watching, incremental XML/layout/timing, and playback optimization are outside this path. Asset changes are validated on the next compile; restart the server after installing system fonts.

Run `bun scripts/preview-benchmark.ts 500 10 en` or `bun scripts/preview-benchmark.ts 500 10 ja` after building to compare fresh single-shot compilation with a resident worker. The fixture has 500 captions and ten edits to one caption. The script reports round-trip time, drawing hits, uncompressed response/WebSocket JSON bytes, and JSON decoding plus reducer time in Bun. Use a matching script/CLI and compiler when comparing protocol revisions. `MEKURU_COMPILER` selects the compiler; `MEKURU_BENCH_OUT=/tmp/benchmark` saves events for browser profiling. These script timings exclude browser layout and paint.

Before the Rust-diff change (`ea09c5a`), a 2026-11-03 local Linux debug-build comparison used the same script and fonts for the pre-integration SVG worker and the integrated HTML worker (500 captions at 640×360; ten edits to the middle caption). Values below are SVG → HTML; the first request is one sample and edits use medians. KB/MB are decimal, uncompressed.

| Language | First worker round trip | Repeated round trip | Initial SSE | SSE per edit |
| --- | --- | --- | --- | --- |
| English | 172.1 → 21.2 ms | 8.58 → 7.70 ms | 16.88 → 0.379 MB | 32.4 → 1.19 KB |
| Japanese | 372.0 → 22.9 ms | 11.20 → 9.95 ms | 33.30 → 0.427 MB | 59.2 → 1.29 KB |

Both workers reused 499/500 drawings and supplied one resource per edit. Replaying the events through the built viewer in headless Chromium at 1200×900, with the edited caption visible, measured first-event-to-second-animation-frame times of 57.9 → 54.3 ms (English) and 105.4 → 75.5 ms (Japanese). Repeated medians were 29.5 → 29.8 ms and 29.7 → 29.8 ms. These include React work, layout and frame waiting, exclude network transfer, and are not isolated paint timings or general performance guarantees. The main measured improvement is generation and transfer size.

Browser checks also covered mixed HTML/SVG order, Japanese wrapping/alignment/stroke/rotation, default and explicit file fonts, same-path font replacement, failed font loading, media DOM retention, seek/zoom/playback preservation, shorter-duration clamping, compile errors, snapshot resynchronization and worker restart. The public timeline-to-caption-to-SRT flow was exercised at 30000/1001 fps.

Before the native server migration, commit `280c231` moved diff generation to Rust and shortened file settling. Both sides used the HTML renderer and the same English/Japanese 500-caption fixtures. Ten local edits on Linux debug builds gave these medians (before → after; decimal KB):

| Language | Rust → CLI response per edit | Worker round trip | File write → ready SSE |
| --- | --- | --- | --- |
| English | 209.95 → 1.23 KB | 8.86 → 7.81 ms | 111.1 → 29.7 ms |
| Japanese | 233.50 → 1.32 KB | 10.46 → 9.69 ms | 115.6 → 32.1 ms |

Rust diff generation took about 0.36 ms, and CLI snapshot-cache application plus event encoding took 0.48–0.61 ms per edit. Browser SSE payloads remained about 1.2–1.3 KB. The larger latency improvement comes from reducing file settling from roughly 102 ms to 22 ms. These are historical Bun-server measurements. The subsequent native server migration consolidates installation and distribution into one executable and removes the remaining relay and IPC.

`bun scripts/preview-latency.ts 500 10 ja` launches the native server and measures atomic file writing through receipt of a ready WebSocket message, including settling and compilation but excluding browser rendering. It shares its input generator with `preview-benchmark.ts`. `MEKURU_COMPILER` selects the executable. Comparisons with earlier SSE versions must use that revision’s script and matching compiler. Initial loading transfers a full snapshot.

Tests cover a relocated binary with no Bun on PATH, embedded UI/assets, range requests, traversal rejection, snapshot/patch reconstruction, invalid XML recovery, chunked/atomic saves, newest-input coalescing, slow-subscriber resynchronization and `--run` shutdown. The CI platform matrix runs the real native server tests after embedding the viewer.

## Internals

- TSX → XML: [types/src/xml.ts](../../pkgs/types/src/xml.ts): expand components and normalize omissions and aliases
- XML parsing: [core/src/lang](../../pkgs/core/src/lang): strict attribute and reference validation
- Layout: [core/src/layout](../../pkgs/core/src/layout): lay out the document with taffy and convert it to a timing tree
- Timing: [core/src/schedule/mod.rs](../../pkgs/core/src/schedule/mod.rs): resolve dependencies; cycles are E510, unreachable references are E504
- Rendering: [core/src/render](../../pkgs/core/src/render): cosmic-text for shaping, Skrifa for glyph outlines, tiny-skia for drawing
- Output: [core/src/pipeline.rs](../../pkgs/core/src/pipeline.rs): audio speed changes, mixing, and encoding
- Viewer: [viewer/src/view](../../pkgs/viewer/src/view) for UI; [viewer/src/logic](../../pkgs/viewer/src/logic) for state and calculations

The timing tree, layout, and draw order are resolved at compile time. Times are integer frames, converted to seconds at the ffmpeg, audio mixing, and preview JSON boundaries. `<dur>` and `<repeat>` do not affect layout; `<hold>` content is positioned relative to the media's parent.

TSX `fps()` is available only while expanding `<mekuru>`. Audio speed changes use `atempo` for export and `playbackRate` for preview.

Viewer state lives in Jotai atoms; `logic/` does not depend on `view/`. Components read and write atoms without custom hooks. Shared DTOs come from `@mekuru/protocol`; React refs handle DOM attachment and cleanup.

## Package boundaries

`core` owns JSX and XML build context. `audio` owns audio resources and WAV processing; `speech` owns synthesis preparation and caches. Engine packages own their HTTP APIs. `narrator` composes portraits and subtitles. `protocol` contains transport types without runtime dependencies. `platform` owns OS integration. The viewer depends on protocol; compiler output and the native server implement that contract in Rust.

Moved APIs: import `AudioSource`, `Audio`, and `readAudio` from `@mekuru/audio`; import `joinWavs` from `@mekuru/audio/wav`; import preview DTOs from `@mekuru/protocol`. No compatibility re-exports remain at the old paths.
