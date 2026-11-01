# @mekuru/core

[日本語](README.jp.md)

TSX authoring and XML output for Mekuru Movie Maker. Provides types for built-in elements and re-exports Hono's JSX runtime.

Requires Bun 1.4 or later.

```sh
bun add -d @mekuru/core
```

- Set `jsx` to `react-jsx` and `jsxImportSource` to `@mekuru/core` in `tsconfig.json`.
- Use `writeXml(path, video)` to expand components and write XML, or `toXml(video)` to get an XML string.
- Async speech components can write an initial draft and update it after synthesis finishes.
- Use [@mekuru/cli](../cli/README.md) to preview the XML or render a video.

See [TSX authoring](../../docs/reference/Component.md) and [built-in elements](../../docs/reference/Syntax.md).
