# @mekuru/protocol

Preview transport types.

Shared TypeScript types for compiler output and server state. This package has no runtime dependencies. CLI and viewer both depend on this contract.

`Compilation` describes the standalone `--emit-preview` output. `WorkerRequest` and `WorkerCompilation` describe the resident compiler's JSON Lines exchange. Shared elements reference ordered SHA-256 drawing IDs, one per original `ViewOp`; preview keys identify elements independently of their drawing content and sequential compiler IDs.

`PreviewEvent` is the SSE contract: `snapshot` supplies the current scene and resources, `status` supplies only server state, and `patch` supplies a base/next version, keyed collection edits, ordering and resource changes. The viewer reconnects for a snapshot if a patch's base version does not match. Compiler, CLI and viewer must be upgraded together.

`TimelineCompilation` exposes integer frame intervals, rational `FrameRate`, source IDs, and compact repeat chains. Preview synchronization uses the `snapshot`, `status`, and `patch` variants of `PreviewEvent`.

Text is a `TextOp` (content, layout and style) in both standalone and worker previews. The viewer renders it as HTML/CSS. `fontSrc` and `fontRevision` identify project fonts; images and media carry their own revision. Export still uses Rust text shaping and path rendering.

Worker requests now acknowledge `baseVersion` instead of listing `knownResources`. Responses carry `previewVersion` and `update` (snapshot, patch, or null), with `stats.diffMs` measuring Rust diff generation. `previewVersion: null` means compilation failure; a successful unchanged scene keeps the acknowledged version and sends no update. The worker retains an acknowledged scene plus one candidate, so discarded responses never become a patch base. Restarting or receiving an unknown base forces a snapshot. This replaces the previous full-scene worker response; update the compiler and CLI together. Browser `PreviewEvent` and standalone `Compilation` are unchanged.
