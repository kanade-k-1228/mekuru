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
- [pkgs/portrait](../../pkgs/portrait/README.md): Animated portraits
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

`mekuru-server` watches XML and sends it to `mekuru-compiler - --emit-preview` through stdin. The compiler returns diagnostics, time intervals, and drawing data as JSON. Diagnostics and the timeline use line numbers from formatted XML.

- Compile sequentially, keeping only the latest pending input.
- Send successful results as SSE `state` events; keep the previous successful result after a failure.
- Show an update indicator in the viewer while `status: "building"`.
- Wrap draft speech in a `<dur>` with an estimated duration. Video export requires completed audio.
- Pass `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=1` to `--run` to preserve reload logs.

## Internals

- TSX → XML: [core/src/xml.ts](../../pkgs/core/src/xml.ts): expand components and normalize omissions and aliases
- XML parsing: [compiler/src/lang](../../pkgs/compiler/src/lang): strict attribute and reference validation
- Layout: [compiler/src/layout](../../pkgs/compiler/src/layout): lay out the document with taffy and convert it to a timing tree
- Timing: [compiler/src/schedule.rs](../../pkgs/compiler/src/schedule.rs): resolve dependencies; cycles are E510, unreachable references are E504
- Rendering: [compiler/src/render](../../pkgs/compiler/src/render): cosmic-text for shaping, Skrifa for glyph outlines, tiny-skia for drawing
- Output: [compiler/src/pipeline.rs](../../pkgs/compiler/src/pipeline.rs): audio speed changes, mixing, and encoding
- Character generation: [create/src/character.ts](../../pkgs/create/src/character.ts): generate TSX and placeholder portraits from the catalog
- Viewer: [viewer/src/view](../../pkgs/viewer/src/view) for UI; [viewer/src/logic](../../pkgs/viewer/src/logic) for state and calculations

The timing tree, layout, and draw order are resolved at compile time. Times are integer frames, converted to seconds at the ffmpeg, audio mixing, and preview JSON boundaries. `<dur>` and `<repeat>` do not affect layout; `<hold>` content is positioned relative to the media's parent.

TSX `fps()` is available only while expanding `<mekuru>`. Audio speed changes use `atempo` for export and `playbackRate` for preview.

Viewer state lives in Jotai atoms; `logic/` does not depend on `view/`. Components read and write atoms without custom hooks. Shared DTOs come from `@mekuru/cli/protocol`; React refs handle DOM attachment and cleanup.
