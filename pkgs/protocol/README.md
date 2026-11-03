# @mekuru/protocol

Preview transport types.

Shared TypeScript types for compiler output and server state. This package has no runtime dependencies. The browser viewer and authoring adapters depend on this contract; the native server implements it in Rust.

`Compilation` describes the standalone `--emit-preview` output. `WorkerRequest` and `WorkerCompilation` describe the resident compiler's JSON Lines exchange. Shared elements reference ordered SHA-256 drawing IDs, one per original `ViewOp`; preview keys identify elements independently of their drawing content and sequential compiler IDs.

`PreviewEvent` is sent as one JSON text message per WebSocket message at `/api/ws`: `snapshot` supplies the current scene and resources, `status` supplies only server state, and `patch` supplies a base/next version, keyed collection edits, ordering and resource changes. The viewer sends `PreviewCommand` (`{"type":"resync"}`) to request a snapshot on the same connection if a patch's base version does not match. A lost connection or three-second resync timeout reconnects the viewer. The old `/api/events` SSE endpoint is removed. The viewer is embedded in the compiler, so they ship together.

`TimelineCompilation` exposes integer frame intervals, rational `FrameRate`, source IDs, and compact repeat chains. Preview synchronization uses the `snapshot`, `status`, and `patch` variants of `PreviewEvent`.

Text is a `TextOp` (content, layout and style) in both standalone and worker previews. The viewer renders it as HTML/CSS. `fontSrc` and `fontRevision` identify project fonts; images and media carry their own revision. Export still uses Rust text shaping and path rendering.

Worker requests now acknowledge `baseVersion` instead of listing `knownResources`. Responses carry `previewVersion` and `update` (snapshot, patch, or null), with `stats.diffMs` measuring Rust diff generation. `previewVersion: null` means compilation failure; a successful unchanged scene keeps the acknowledged version and sends no update. The worker retains an acknowledged scene plus one candidate, so discarded responses never become a patch base. Restarting or receiving an unknown base forces a snapshot. This replaces the previous full-scene worker response; update tool clients together with the compiler. Browser `PreviewEvent` and standalone `Compilation` are unchanged.

The native `--serve` path calls the compiler in process and sends `PreviewEvent` directly over WebSocket. JSON Lines worker types remain for external tools and benchmarks.
