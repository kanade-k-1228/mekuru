# @mekuru/viewer

[日本語](README.jp.md)

The browser preview and timeline UI for Mekuru Movie Maker, built with React, Jotai, and Vite. This is a private workspace package bundled with [@mekuru/cli](../cli/README.md).

For development, start `mekuru-server` on port 3333, then run these commands from the repository root with Bun 1.4 or later:

```sh
bun install
bun run --cwd pkgs/viewer dev
```

- Open `http://localhost:5173`; API and media requests are proxied to port 3333.
- `bun run --cwd pkgs/viewer build` writes the production UI to `pkgs/cli/viewer/`.
- `src/view/` contains the UI; `src/logic/` contains state and calculations.

See [development](../../docs/dev/Developer.md) for compiler setup and running the example project.
