# Development

[日本語](Developer.jp.md)

## Repository structure

- [pkgs/core](../../pkgs/core/README.md): TSX types, JSX runtime, and XML output
- [pkgs/compiler](../../pkgs/compiler/README.md): Rust compiler: XML → video
- [pkgs/cli](../../pkgs/cli/README.md): Preview server and compiler launcher
- [pkgs/viewer](../../pkgs/viewer/README.md): React viewer, built into `pkgs/cli/viewer/`
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

TypeScript packages run directly from source and need no rebuild after changes. After compiler changes, run `cargo build --workspace --locked`; after viewer changes, run `bun run --cwd pkgs/viewer build`. See [CLI](../../pkgs/cli/README.md) for compiler lookup order.

For viewer development, start these in separate terminals:

```sh
bun run --cwd example preview --no-open
bun run --cwd pkgs/viewer dev
```

The development server at `http://localhost:5173` proxies API requests to port 3333.

TypeScript configuration lives at the root and in the viewer. Generated projects use `pkgs/create/template/tsconfig.json`. There are no Project References, incremental builds, or per-package JS/type declaration outputs. Type checking and Bun tests can run before building.

## Releases

Merge normal changes into `main` through a PR from a working branch. Versions come from Git tags without a `v` prefix; versions in the repository stay at `0.0.0`. All packages share a release version. Before 1.0, increment minor for features or breaking changes, and patch for fixes.

```sh
git switch main
git pull
git tag 0.3.0
git push origin 0.3.0
```

[ci.yml](../../.github/workflows/ci.yml) runs checks, verifies Rust 1.89 support, and builds and smoke-tests five platforms. Tags use release builds; other runs use debug builds. Dependencies use `bun ci`, with Bun's version taken from `packageManager`.

Publishing a tag:

1. `release.ts stamp` sets the version in manifests and lockfiles without committing the changes.
2. `pack` creates compiler npm tarballs; `deps` sets the CLI's `optionalDependencies`.
3. Build the viewer and publish the compiler and public workspaces with `bun publish`. Exclude `private` packages.
4. Create a GitHub Release with release notes.

Only publishing steps pass `NPM_TOKEN` as `NPM_CONFIG_TOKEN`. Tags such as `0.3.0-rc.1` use npm's `next` tag and GitHub prereleases. Do not publish from a local machine.

A failed workflow can be rerun. `--tolerate-republish` handles versions already published. `release.ts` rejects release preparation with version `0.0.0`. To patch an older version, branch from its tag and increment patch.

## How preview works

`mekuru-server` watches XML and keeps `mekuru-compiler - --preview-worker` running. Each stdin/stdout line is one JSON request/response. Requests contain `version`, `xml`, and `knownResources` (the drawing hashes retained by the CLI). Responses contain the complete lightweight scene, diagnostics, missing resources, and drawing-cache statistics. `--emit-preview` keeps its standalone, expanded JSON format. Update the compiler, CLI and viewer together.

- Parsing, layout and timing run over the entire input. Font books, glyph outlines, text measurements, media metadata and `ViewOp` drawing conversions are reused. A resource is one original `ViewOp`, even when the compiler merges many operations into one display element.
- The drawing LRU has a 64 MiB estimated-size budget; each of up to four font books has 4 MiB of measurements and 16 MiB of glyph outlines. Probe and image-dimension LRUs each have a 1 MiB budget. Active response data and the font system's own storage are additional. File keys include path, size and modification time; font-file dependencies are preloaded and validated before layout. Diagnostics always use the current formatted XML's line numbers.
- Sequential IR IDs are preserved. Separate preview keys match scoped XML IDs, then unchanged sibling subtrees, then equal-length same-tag gaps. Ambiguous insertions/deletions get new keys; a worker restart gets a fresh key namespace. Rendering order is independent of identity.
- Compilation is sequential and only the newest pending input survives. Stale responses never advance the CLI's resource inventory. A broken worker is retried once with the latest input; another failure retains the last successful preview and shows an error.
- `/api/events` sends `snapshot` on connection/reconnection, `status` for building/errors/diagnostics alone, and versioned `patch` events for successful changes. Patches contain keyed element/node/clip changes, order changes and resource additions/removals. The CLI serializes the selected event once for all clients and uses a snapshot when it is smaller. `/api/preview` returns the current snapshot for inspection; the old drawing/path POST endpoints are gone.
- The viewer applies each patch atomically, preserving unchanged element and resource objects. A version mismatch or missing resource reconnects for a snapshot. CLI and viewer retain only resources referenced by the current preview. Status changes leave interval indexes and timeline layout intact; playback and zoom persist, with stored playback time clamped when duration shrinks.
- Wrap draft speech in a `<dur>` with an estimated duration. Video export requires completed audio. Pass `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=1` to `--run` to preserve reload logs.

Asset-only watching, incremental XML/layout/timing, and playback optimization are outside this path. Asset changes are validated on the next compile; restart the server after installing system fonts.

Run `bun scripts/preview-benchmark.ts 500 10` after building to compare fresh single-shot compilation with a resident worker for 500 captions and ten local text edits. It reports generation/round-trip time, drawing hits, response and SSE sizes, and JSON decoding plus viewer-reducer time in Bun. `MEKURU_BENCH_OUT=/tmp/benchmark` also saves events for browser profiling. These are uncompressed measurements, not paint timings.

A local debug-build run (500 English captions at 640×360, one caption changed per edit) measured a 271 ms median for a fresh single-shot compile, a 253 ms first worker round trip, and an 11 ms median repeated round trip (9.4 ms inside the compiler). Repeated edits hit 499/500 drawings and sent one resource: about 32.4 kB over SSE versus 16.8 MB for the full standalone output. Across two Chromium runs, the median JSON decoding plus reducer application time was 15–77 ms initially and 0.7–1.3 ms per edit. These fixture-specific figures are reproducible with the script and are not a comparison against the earlier 11.3 MB fixture. Browser checks also verified that video/audio DOM nodes survive text edits, insertion, compile failure and snapshot resynchronization; status events carry zero drawing data. Killing the real worker also recovered on the next edit.

## Internals

- TSX → XML: [core/src/xml.ts](../../pkgs/core/src/xml.ts): expand components and normalize omissions and aliases
- XML parsing: [compiler/src/lang](../../pkgs/compiler/src/lang): strict attribute and reference validation
- Layout: [compiler/src/layout](../../pkgs/compiler/src/layout): lay out the document with taffy and convert it to a timing tree
- Timing: [compiler/src/schedule/mod.rs](../../pkgs/compiler/src/schedule/mod.rs): resolve dependencies; cycles are E510, unreachable references are E504
- Rendering: [compiler/src/render](../../pkgs/compiler/src/render): cosmic-text for shaping, Skrifa for glyph outlines, tiny-skia for drawing
- Output: [compiler/src/pipeline.rs](../../pkgs/compiler/src/pipeline.rs): audio speed changes, mixing, and encoding
- Viewer: [viewer/src/view](../../pkgs/viewer/src/view) for UI; [viewer/src/logic](../../pkgs/viewer/src/logic) for state and calculations

The timing tree, layout, and draw order are resolved at compile time. Times are integer frames, converted to seconds at the ffmpeg, audio mixing, and preview JSON boundaries. `<dur>` and `<repeat>` do not affect layout; `<hold>` content is positioned relative to the media's parent.

TSX `fps()` is available only while expanding `<mekuru>`. Audio speed changes use `atempo` for export and `playbackRate` for preview.

Viewer state lives in Jotai atoms; `logic/` does not depend on `view/`. Components read and write atoms without custom hooks. Shared DTOs come from `@mekuru/protocol`; React refs handle DOM attachment and cleanup.

## Package boundaries

`core` owns JSX and XML build context. `audio` owns audio resources and WAV processing; `speech` owns synthesis preparation and caches. Engine packages own their HTTP APIs. `narrator` composes portraits and subtitles. `protocol` contains transport types without runtime dependencies. `platform` owns OS integration. The viewer depends on protocol, not CLI.

Moved APIs: import `AudioSource`, `Audio`, and `readAudio` from `@mekuru/audio`; import `joinWavs` from `@mekuru/audio/wav`; import preview DTOs from `@mekuru/protocol`. No compatibility re-exports remain at the old paths.
