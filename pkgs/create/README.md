# @mekuru/create

[日本語](README.jp.md)

Create a Mekuru project from an irodoru sample or a blank script, with preview/build commands. Requires Bun 1.4+.

```sh
bun create @mekuru my-video
cd my-video
bun install
bun run irodoru # keep running in another terminal (requires Docker)
bun preview
```

The folder, template, and upload sites are prompted in a terminal when unspecified. The command checks ffmpeg after creation.

- **irodoru sample (default)**: Includes speech, its packages, and `bun run irodoru` / `bun run voicevox`. The default irodoru sample needs no reference audio. These commands start prebuilt Docker images; the first run downloads the image and Ctrl+C stops the server. The default server is `http://127.0.0.1:8080`; override it with `MEKURU_IRODORU_URL`. See [setup and settings](../speech/README.md).
- **Empty project**: Includes a blank `src/main.tsx` and minimal dependencies, without speech packages or a server command.

```sh
bun create @mekuru my-video --template empty --yes
```

- `--template <template>`: `sample` or `empty`. Default: `sample`.
- `--upload <sites>`: Add upload scripts and YAML settings for `youtube,niconico`. Default: none.
- `--yes`: Use defaults without prompts; also the behavior outside a terminal.
- `--force`: Allow creation in a nonempty directory.

[Tutorial](../../example/README.md) (Japanese) · [Project structure and workflow](../../docs/reference/Component.md).
