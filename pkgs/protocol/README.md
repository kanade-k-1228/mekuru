# @mekuru/protocol

Preview transport types.

Shared TypeScript types for compiler output and server state. This package has no runtime dependencies. CLI and viewer both depend on this contract.

`Compilation` describes the unchanged `--emit-preview` output. `WorkerRequest` and `WorkerCompilation` describe the resident compiler's JSON Lines exchange. Shared elements reference ordered SHA-256 drawing IDs, one per original `ViewOp`; preview keys identify elements independently of their drawing content and sequential compiler IDs.

`PreviewEvent` is the SSE contract: `snapshot` supplies the current scene and resources, `status` supplies only server state, and `patch` supplies a base/next version, keyed collection edits, ordering and resource changes. The viewer reconnects for a snapshot if a patch's base version does not match. Compiler, CLI and viewer must be upgraded together.
