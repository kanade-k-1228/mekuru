# Uploading videos

[日本語](Upload.jp.md)

Each upload command reads a YAML configuration and uploads the video. Paths in the configuration are relative to the project folder containing `package.json`.

## Setup

`bun create @mekuru --upload youtube,niconico` generates upload commands and `configs/`. For an existing project, add [@mekuru/youtube](../../pkgs/youtube/README.md) or [@mekuru/niconico](../../pkgs/niconico/README.md).

- YouTube: `mekuru-youtube`. Default configuration: `configs/youtube.yaml`.
- niconico: `mekuru-niconico`. Default configuration: `configs/niconico.yaml`.

Generated projects provide `bun run upload:youtube` and `bun run upload:niconico`. See the example configurations for [YouTube](../../example/configs/youtube.yaml) and [niconico](../../example/configs/niconico.yaml).

## Configuration

- `video`: Video path. Default: `video.mp4`
- `title`: Required title
- `description`: Multiline string or array of lines
- `tags`: Array of tags
- `thumbnail`: Optional thumbnail, such as `configs/thumbnail.png`

```yaml
# configs/youtube.yaml
video: video.mp4
title: はじめての動画
description: |
  Mekuru で作った動画です。
tags: [Mekuru]
privacy: private
```

### Multiple configurations

Pass configuration files as arguments. Multiple files are uploaded in order.

```sh
bun run upload:youtube configs/youtube.yaml configs/youtube-short.yaml
```

## YouTube

### First-time authentication

1. Create a project in [Google Cloud](https://console.cloud.google.com/) and enable YouTube Data API v3.
2. Configure the OAuth consent screen and add your Google account as a test user.
3. Create an OAuth client ID for a desktop app and save its JSON to `~/.config/mekuru/youtube-client.json`.
4. Sign in through the browser opened on the first upload.

On Windows, credentials are stored in `%APPDATA%\mekuru\`. Set `MEKURU_CONFIG_DIR` to change the directory. The login is saved in `youtube-token.json`; delete it to switch accounts.

```sh
bun run upload:youtube --dry-run   # Validate settings without signing in or uploading
bun run upload:youtube             # Upload and print the URL
```

### Additional settings and limits

- `category`: Category ID. Default: 22 (People & Blogs). 27: Education; 28: Science & Technology
- `privacy`: `private` (default), `unlisted`, or `public`
- `publishAt`: Scheduled publication time, such as `2026-11-01T18:00:00+09:00`. Use with `privacy: private`
- `madeForKids`: Whether the video is made for kids. Omit to use the channel default

Titles allow 100 characters, descriptions 5,000 bytes, and tags 500 characters in total. Titles and descriptions cannot contain `<` or `>`. Thumbnails must be JPEG or PNG, at most 2 MB, and the channel must support custom thumbnails.

The API project's audit status may force uploads to remain private. Check visibility in YouTube Studio after uploading. OAuth test settings can shorten login validity; API quotas limit uploads.

## niconico

### First-time setup

```sh
bunx playwright-core install chromium
bunx mekuru-niconico login
bun run upload:niconico --check
```

To use an existing Chrome or Chromium, set `MEKURU_BROWSER` to its executable path. Login data is saved in `~/.config/mekuru/niconico-browser/`, or `%APPDATA%\mekuru\niconico-browser\` on Windows. To switch accounts, delete this folder and sign in again.

### Upload

`--check` fills in the browser form and leaves the submit button for you to click. `bun run upload:niconico` submits automatically; add `--headed` to show the browser window.

The command uses Playwright to operate the upload page, so page changes may break it. On failure, it writes `.mekuru/niconico-error.png` and outputs the content for manual upload.
