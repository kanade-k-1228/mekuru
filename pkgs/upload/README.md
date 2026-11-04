# @mekuru/upload

[日本語](README.jp.md)

Uploads Mekuru Movie Maker videos to YouTube and niconico. A YAML file gives the video path, title, description, tags, and optional thumbnail. Requires Bun 1.4 or later.

```sh
bun add -d @mekuru/upload
```

Run the commands from the project folder; file paths in the configuration are relative to it. The default configuration is `configs/youtube.yaml` or `configs/niconico.yaml`; pass other YAML paths as arguments to upload several videos in order.

## YouTube

Prepare `configs/youtube.yaml` and the OAuth client described in the [upload guide](../../docs/reference/Upload.md#youtube), then:

```sh
bunx mekuru-youtube --dry-run   # show the settings without signing in or uploading
bunx mekuru-youtube             # the first upload opens a browser to sign in to Google
```

## niconico

`mekuru-niconico` fills in the upload page with Playwright, so it needs Chromium. Prepare `configs/niconico.yaml`, then:

```sh
bunx playwright-core install chromium
bunx mekuru-niconico login      # save the sign-in for later uploads
bunx mekuru-niconico --check    # fill in the form in a browser window; you post it
bunx mekuru-niconico            # post automatically
```

Set `MEKURU_BROWSER` to use an existing Chrome or Chromium executable.

See the example configurations for [YouTube](../../example/configs/youtube.yaml) and [niconico](../../example/configs/niconico.yaml).
