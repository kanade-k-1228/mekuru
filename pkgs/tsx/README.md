# @mekuru/tsx

[日本語](README.jp.md)

TSX authoring and XML output for Mekuru Movie Maker. Provides types for built-in elements and re-exports Hono's JSX runtime.

Requires Bun 1.4 or later.

```sh
bun add -d @mekuru/tsx
```

- Set `jsx` to `react-jsx` and `jsxImportSource` to `@mekuru/tsx` in `tsconfig.json`.
- Type components with `FC<Props>`.
- Use `writeXml(path, video)` to expand components and write XML, or `toXml(video)` to get an XML string.
- Async speech components can write an initial draft and update it after synthesis finishes.
- Use [@mekuru/core](../core/README.md) to preview the XML or render a video.

See [TSX authoring](../../docs/reference/Component.md) and [built-in elements](../../docs/reference/Syntax.md).
