# @mekuru/create

[日本語](README.jp.md)

Create a Mekuru project from a VOICEVOX sample or a blank script, with preview/build commands. Requires Bun 1.4+.

```sh
bun create @mekuru my-video
cd my-video
bun install
bun run voicevox # keep running in another terminal (requires Docker)
bun preview
```

The folder, template, and upload sites are prompted in a terminal when unspecified. The command checks ffmpeg after creation.

- **VOICEVOX sample (default)**: Includes a speech sample, speech packages, and `bun run voicevox`. The command starts the CPU server in Docker at `http://127.0.0.1:50021`, downloading the image on first use. Stop it with Ctrl+C. You can also start the VOICEVOX app instead. See the [speech documentation](../speech/README.md) to switch engines later.
- **Empty project**: Includes a blank `src/main.tsx` and minimal dependencies, without speech packages or a server command.

```sh
bun create @mekuru my-video --template empty --yes
```

- `--template <template>`: `sample` or `empty`. Default: `sample`.
- `--upload <sites>`: Add upload scripts and YAML settings for `youtube,niconico`. Default: none.
- `--yes`: Use defaults without prompts; also the behavior outside a terminal.
- `--force`: Allow creation in a nonempty directory.

[Tutorial](../../example/README.md) (Japanese) · [Project structure and workflow](../../docs/reference/Component.md).
