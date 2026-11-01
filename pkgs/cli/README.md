# @mekuru/cli

[日本語](README.jp.md)

Preview and video export commands. Requires Bun 1.4+, ffmpeg, ffprobe, and fonts for the script.

```sh
bun add -d @mekuru/cli
bunx mekuru-server .mekuru/main.xml --run 'bun --hot src/main.tsx'
bunx mekuru-compiler .mekuru/main.xml -o video.mp4
```

- `mekuru-server <xml>`: Watch XML and open the browser viewer.
- `--run <cmd>`: Run the command that generates XML.
- `--port`, `--title`: Port (default: 3333) and browser title.
- `--no-open`, `--open`: Control browser launch. Default: open, unless `MEKURU_OPEN=0`.
- `mekuru-compiler <xml>`: Export video with the native compiler.
- `-o <file>`: Output file.
- `--preview`: Half resolution, 15 fps.
- `--scale`, `--fps`: Resolution multiplier and frame rate.
- `--from`, `--to`: Export range in seconds.
- `--preset`, `--crf`: x264 encoding settings.
- `--no-audio`: Export without audio.

Both commands accept `--root <dir>` for the media base directory. Default: the XML directory, or its parent when named `.mekuru/`.

Compiler lookup: `MEKURU_COMPILER` → platform npm package → newest local `target/debug` or `target/release` binary (debug wins ties). `@mekuru/cli/protocol` exports the server/viewer types.

[TSX workflow](../../docs/reference/Component.md) · [Development](../../docs/dev/Developer.md).
