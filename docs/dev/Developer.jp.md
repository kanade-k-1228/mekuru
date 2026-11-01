# 開発

[English](Developer.jp.md)

## リポジトリ構成

- [pkgs/core](../../pkgs/core/README.jp.md): TSX の型・JSX ランタイム・XML 出力
- [pkgs/compiler](../../pkgs/compiler/README.jp.md): Rust コンパイラ。XML → 動画
- [pkgs/cli](../../pkgs/cli/README.jp.md): プレビューサーバーとコンパイラの起動
- [pkgs/viewer](../../pkgs/viewer/README.jp.md): React のビューア。ビルド先は `pkgs/cli/viewer/`
- [pkgs/create](../../pkgs/create/README.jp.md): プロジェクト生成
- [pkgs/speech](../../pkgs/speech/README.jp.md): 読み上げ部品の実装用 API
- `pkgs/voicevox`・`coeiroink`・`style-bert-vits2`・`voisona`: 音声エンジンとの連携
- [pkgs/portrait](../../pkgs/portrait/README.jp.md): 動く立ち絵
- `pkgs/youtube`・`niconico`: 投稿コマンド
- [example](../../example/README.md): チュートリアルと解説動画
- [scripts/release.ts](../../scripts/release.ts): リリースの版設定・梱包・依存関係の設定

## ビルド

ルートの `packageManager` が指定する Bun、Rust 1.89 以上、C リンカが必要です。Ubuntu のリンカは `build-essential` で導入できます。

```sh
bun install
bun run build                     # ビューアと開発用コンパイラ
bun run build:release             # 最適化ビルド
bun run --cwd example preview     # サンプル
```

- `bun run typecheck`: TypeScript の型
- `bun run test`: Bun・Rust のテスト
- `bun run check`: Biome・型・rustfmt・clippy
- `bun run fmt`: Biome・rustfmt による整形と自動修正

`bun build`・`bun test` は Bun 自身のコマンドです。ルートのスクリプトを呼ぶ場合は `bun run` を使います。

TypeScript パッケージはソースを直接実行するため、変更後のビルドは不要です。コンパイラ変更後は `cargo build --workspace --locked`、ビューア変更後は `bun run --cwd pkgs/viewer build` を実行します。コンパイラの選択順は [CLI](../../pkgs/cli/README.jp.md) を参照してください。

ビューアの開発は、別々のターミナルで次を起動します。

```sh
bun run --cwd example preview --no-open
bun run --cwd pkgs/viewer dev
```

開発サーバーは `http://localhost:5173` からポート3333へ API を転送します。

型設定はルートとビューアの2つです。生成プロジェクト用は `pkgs/create/template/tsconfig.json` に置きます。Project References・増分ビルド・パッケージごとの JS/型定義生成は使いません。型チェックと Bun テストはビルド前にも実行できます。

## リリース

通常の変更は作業ブランチから `main` へ PR で取り込みます。版は `v` なしの Git タグで管理し、リポジトリ内の版は `0.0.0` のままにします。全パッケージは同じ版で公開し、1.0 までは機能追加・破壊的変更で minor、修正で patch を上げます。

```sh
git switch main
git pull
git tag 0.3.0
git push origin 0.3.0
```

[ci.yml](../../.github/workflows/ci.yml) が検査・Rust 1.89 の確認・5環境のビルドと起動確認を実行します。タグでは release、それ以外は debug ビルドです。依存関係は `bun ci`、Bun の版は `packageManager` に従います。

タグの公開処理:

1. `release.ts stamp` が版を manifests と lockfiles に設定する。変更はコミットしない。
2. `pack` がコンパイラを npm tarball にし、`deps` が CLI の `optionalDependencies` を設定する。
3. ビューアをビルドし、コンパイラと公開対象の workspace を `bun publish` で公開する。`private` のパッケージは除外する。
4. 変更点付きの GitHub Release を作成する。

認証は公開ステップだけで `NPM_TOKEN` を `NPM_CONFIG_TOKEN` に渡します。`0.3.0-rc.1` のようなタグは npm の `next` と GitHub のプレリリースになります。手元からは公開しません。

失敗時は同じワークフローを再実行できます。`--tolerate-republish` が公開済みの版を処理します。`release.ts` は版が `0.0.0` の公開準備を拒否します。旧版の修正は該当タグからブランチを作り、patch を上げます。

## プレビューの仕組み

`mekuru-server` が XML を監視し、`mekuru-compiler - --emit-preview` に標準入力で渡します。コンパイラは診断・時間区間・描画データを JSON で返します。整形した XML の行番号を診断とタイムラインに使います。

- コンパイルは逐次実行し、待機中の入力は最新だけ保持する。
- 成功結果を SSE の `state` で送り、失敗時は直前の成功結果を保持する。
- `status: "building"` の間はビューアに更新中の表示を出す。
- 下書き音声は見積もりの `<dur>` で包む。動画の書き出しには完成した音声が必要。
- `--run` には `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=1` を渡し、更新ログを保持する。

## 内部構造

- TSX → XML: [core/src/xml.ts](../../pkgs/core/src/xml.ts)。部品を展開し、省略・別名を正規化
- XML の解析: [compiler/src/lang](../../pkgs/compiler/src/lang)。厳格な属性・参照の検査
- 配置: [compiler/src/layout](../../pkgs/compiler/src/layout)。taffy で文書全体を配置し、時間の木に変換
- 時間の計算: [compiler/src/schedule.rs](../../pkgs/compiler/src/schedule.rs)。依存順に解決。循環は E510、到達できない参照は E504
- 描画: [compiler/src/render](../../pkgs/compiler/src/render)。cosmic-text で組版、Skrifa で文字輪郭、tiny-skia で描画
- 出力: [compiler/src/pipeline.rs](../../pkgs/compiler/src/pipeline.rs)。音声の速度変更・ミックス・エンコード
- ビューア: [viewer/src/view](../../pkgs/viewer/src/view) は UI、[viewer/src/logic](../../pkgs/viewer/src/logic) は状態と計算

時間の木・配置・描画順はコンパイル時に確定します。時刻は整数フレームで、秒への変換は ffmpeg・音声ミックス・プレビュー JSON との境界で行います。`<dur>`・`<repeat>` は配置に影響せず、`<hold>` の表示内容は素材の親を基準に配置します。

TSX の `fps()` は `<mekuru>` の展開中だけ使えます。音声の速度変更は書き出しで `atempo`、プレビューで `playbackRate` を使います。

ビューアの状態は Jotai の atom に置き、`logic/` は `view/` に依存しません。コンポーネントは atom を読み書きし、カスタムフックは使いません。共通の DTO は `@mekuru/cli/protocol`、DOM の接続と解除は React の ref で扱います。
