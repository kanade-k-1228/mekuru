# @mekuru/niconico

[日本語](README.jp.md)

Posts Mekuru Movie Maker videos to niconico by filling its upload page with Playwright. Reads the video path, title, description, tags, and optional thumbnail from YAML.

Requires Bun 1.4 or later and Chromium. Prepare `configs/niconico.yaml`, then run from the project folder:

```sh
bun add -d @mekuru/niconico
bunx playwright-core install chromium
bunx mekuru-niconico login
bunx mekuru-niconico --check
```

- `login` saves a browser session for later uploads. `--check` fills the form in a browser window and leaves final submission to you.
- Run `bunx mekuru-niconico` to post automatically; use `--headed` to show the browser.
- The default configuration file is `configs/niconico.yaml`. Pass other YAML paths as arguments; file paths inside them are relative to the project folder.
- Set `MEKURU_BROWSER` to use an existing Chrome or Chromium executable.

See the [example configuration](../../example/configs/niconico.yaml) and [upload guide](../../docs/reference/Upload.md).
