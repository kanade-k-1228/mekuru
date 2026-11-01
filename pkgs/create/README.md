# @mekuru/create

[日本語](README.jp.md)

Create a Mekuru project with a TSX script, character components, and preview/build commands. Requires Bun 1.4+.

```sh
bun create @mekuru my-video --voice zunda,metan
cd my-video
bun install
```

Unspecified choices are prompted in a terminal. The command checks ffmpeg and the selected speech engines after creation.

- `--voice <names>`: Comma-separated characters or engines. An engine selects all its characters; default: none.
- `--upload <sites>`: Add upload scripts and YAML settings for `youtube,niconico`. Default: none.
- `--yes`: Use defaults without prompts; also the behavior outside a terminal.
- `--force`: Allow creation in a nonempty directory.
- `--mekuru <spec>`: Mekuru package version specification.

[Tutorial](../../example/README.md) (Japanese) · [Project structure and workflow](../../docs/reference/Component.md).
