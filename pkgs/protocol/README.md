# @mekuru/protocol

Preview transport types.

Shared TypeScript types for compiler output and server state. This package has no runtime dependencies. The browser viewer depends on this contract; the native server implements it in Rust.

Shared elements reference ordered SHA-256 drawing IDs, one per original `ViewOp`; preview keys identify elements independently of their drawing content and sequential compiler IDs. Text is a `TextOp` (content, layout and style) that the viewer renders as HTML/CSS. `fontSrc` and `fontRevision` identify project fonts; images and media carry their own revision. Export still uses Rust text shaping and path rendering.

`PreviewEvent` is sent as one JSON text message per WebSocket message at `/api/ws`: `snapshot` supplies the current scene and resources, `status` supplies only server state, and `patch` supplies a base/next version, keyed collection edits, ordering and resource changes. The viewer sends `PreviewCommand` (`{"type":"resync"}`) to request a snapshot on the same connection if a patch's base version does not match. A lost connection or three-second resync timeout reconnects the viewer. The viewer is embedded in the compiler, so they ship together.
