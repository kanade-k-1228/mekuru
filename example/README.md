# Mekuru Movie Maker の使い方

## 構成

1. インストールと開発環境構築
2. 合成音声との連携

## 動画内のサンプル

`bun create @mekuru my-video --engine voisona` で作ったプロジェクトに、[tutorial/character](tutorial/character) を `src/character`、[tutorial/assets](tutorial/assets) を `assets` としてコピーします。[tutorial/main.tsx](tutorial/main.tsx) は完成時の台本です。

## 立ち絵

`../engine/assets/character/pikao-tsuzumi/` の加工済み部品を、`preview`・`build` 時にコピーします。別のフォルダーから取り込む場合は `bun run --cwd example portrait /path/to/pikao-tsuzumi`。素材は Git の管理対象外です。

## クレジット

- 音声: VoiSona Talk:すずきつづみ
- 立ち絵: ぴかお 様（[ぴかお百貨店](https://booth.pm/ja/items/4330522)）
