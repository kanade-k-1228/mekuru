# @mekuru/portrait

[日本語](README.jp.md)

Animated character portraits for Mekuru Movie Maker. Layers image parts in YukkuriMovieMaker4's animated portrait format, with blinking, facial expressions, and lip sync driven by speech volume.

Requires Bun 1.4 or later, [@mekuru/core](../core/README.md), and a folder of portrait image parts.

```sh
bun add -d @mekuru/core @mekuru/portrait
```

- Import `portrait` from `@mekuru/portrait` and call `portrait({ src, ...options })` with a path relative to the project folder.
- The returned `Stand` component displays the idle portrait; `Talk` wraps one speech component or audio element and animates the portrait while it plays.
- Define expressions with `face` and `faces`, and use `x`, `y`, `w`, `h`, and `z` to position the portrait.

See [portraits](../../docs/reference/Portrait.md) for the image folder structure and examples.
