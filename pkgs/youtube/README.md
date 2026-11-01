# @mekuru/youtube

[日本語](README.jp.md)

Uploads Mekuru Movie Maker videos to YouTube using a YAML file for the video path, title, description, tags, visibility, and optional thumbnail. Requires Bun 1.4 or later.

Prepare `configs/youtube.yaml` and the OAuth client configuration described in the [upload guide](../../docs/reference/Upload.md), then run from the project folder:

```sh
bun add -d @mekuru/youtube
bunx mekuru-youtube --dry-run
bunx mekuru-youtube
```

- The default configuration file is `configs/youtube.yaml`; pass other YAML paths as arguments to upload multiple videos in order.
- File paths in the configuration are relative to the project folder.
- `--dry-run` displays the upload settings without signing in or uploading. The first upload opens a browser for Google sign-in.

See the [example configuration](../../example/configs/youtube.yaml).
