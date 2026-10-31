# 開発

## リポジトリ構成

```
pkgs/
  core/              npm @mekuru/core: 組み込みの要素の型と writeXml（TSX → 厳格な XML。JSX のランタイムは Hono を再 export）
  compiler/          mekuru-compiler（Rust）: XML → 動画
  cli/               npm @mekuru/cli: mekuru-server（ビューアのサーバ）と mekuru-compiler の起動
  viewer/            ビューアの UI（React + Vite。pkgs/cli/viewer にビルドされる）
  create/            npm @mekuru/create
  speech/            @mekuru/speech: 読み上げの部品の土台
  voicevox/ coeiroink/ style-bert-vits2/
                     読み上げの部品（@mekuru/<名前>）
  portrait/          @mekuru/portrait: 立ち絵
  youtube/           @mekuru/youtube: YouTube へのアップロード
  niconico/          @mekuru/niconico: ニコニコ動画への投稿（ヘッドレスブラウザで投稿ページに入力）
example/             サンプル（使い方の動画）
scripts/release.ts   リリースの準備（タグの版の書き込み・コンパイラの npm tarball 作成・optionalDependencies の設定）
```

## ビルド

[Bun](https://bun.sh/)（使用する版はルートの `packageManager`）と Rust 1.89 以上、OS の C リンカが必要。Ubuntu では `build-essential` をインストールする。

```
$ bun install
$ bun run build                     # ビューアと開発用 mekuru-compiler
$ bun run build:release             # ビューアと配布用 mekuru-compiler
$ bun run typecheck                 # TS の型チェックだけ（出力なし）
$ bun run test                      # Bun と Rust の回帰テスト
$ bun run check                     # Biome・型チェック・rustfmt・clippy
$ bun run fmt                       # 整形と lint の自動修正（Biome・rustfmt）
$ bun run --cwd example preview     # サンプルをプレビュー
$ bun run --cwd pkgs/viewer dev     # ビューアの開発サーバ http://localhost:5173（:3333 にプロキシ）
```

- `bun build`・`bun test` は Bun 自身のコマンドなので、スクリプトは `bun run build`・`bun run test` で呼ぶ
- ビューアの開発: `bun run --cwd example preview --no-open` を起動してから `bun run --cwd pkgs/viewer dev`
- コンパイラを変えたら `cargo build --workspace --locked`（プレビューもコンパイラを使う）。動画を書き出す時など、実行速度を優先する場合は `bun run build:release`
- ビューアを変えたら `bun run --cwd pkgs/viewer build`
- `mekuru-compiler` コマンドが探す順: `MEKURU_COMPILER` → `@mekuru/compiler-<os>-<cpu>` → `target/{debug,release}/` のうち更新日時が新しいもの。同時刻なら debug を使う。明示的に選ぶ場合は `MEKURU_COMPILER` を指定する
- npm パッケージは Bun 1.4 以上専用。`exports` / `bin` は `src/*.ts` / `src/*.tsx` を直接指し、JS・型定義の生成やアセットのコピーは不要。TS を変えたらそのまま実行できる
- 型チェックはルートの `tsconfig.json`（パッケージ・テスト・example・scripts）と、React を使うビューアの設定だけ。Project References・増分ビルド情報・パッケージごとのビルドスクリプトは使わない。生成するプロジェクト用の設定は `pkgs/create/template/tsconfig.json` に置く
- `bun run typecheck` と `bun test` はビルド前でも実行できる。Rust だけなら Cargo、ビューアだけならそのパッケージの Vite コマンドを直接使う
- 入出力・HTTP サーバー・子プロセス・ハッシュ・YAML は Bun API、テストは `bun:test` を使う。Bun 固有の代替がない非同期コンテキスト・パス・ディレクトリ操作・監視・端末の装飾、および公開同期 API の維持に必要な読み取りと権限指定が必要なトークン保存は、Bun が実装する `node:` API を使う
- コーディング規約: [Coding.md](Coding.md)
- ドキュメントのサンプルは example から引き、コードの 1 行目に `// example/src/main.tsx（抜粋）` のように元のファイルを書く（`…` は省略）

## リリース

- ブランチは `main` だけ。作業ブランチから PR で取り込む。`ci.yml` が check（`bun run check`・`bun run test`・ビューアビルド）と check-msrv（Rust 1.89）を実行し、その後に全 5 プラットフォームで mekuru-compiler をビルドして起動確認する。PR と `main` は開発用、タグは release ビルド
- 版は git のタグ `<major>.<minor>.<patch>`（`v` はつけない）だけが持つ。リポジトリの `package.json`・`Cargo.toml` は `0.0.0` のまま変えない
- 全パッケージを同じ版で出す。1.0 までは機能追加・破壊的変更で minor、修正で patch を上げる

```
$ git switch main && git pull
$ git tag 0.3.0
$ git push origin 0.3.0
```

- CI の Bun はルートの `packageManager` に固定し、`setup-bun` が読み取る。依存関係は `bun ci` でロックファイルどおりにインストールする。開発・CI の Bun は 1.4.4（`bun publish --recursive` を使用）
- タグを push すると `ci.yml` が check → build → release まで動く。`release.ts stamp` でタグの版を全 `package.json`・`Cargo.toml`・`Cargo.lock` に書き込み（コミットはしない）、mekuru-compiler を各プラットフォームでビルドする
- `release.ts pack` はコンパイラのパッケージを作り、`bun pm pack` で `compiler-<os>-<cpu>.tgz` にする。Actions の成果物にはこの tarball を渡して、実行権限を保持する。`release.ts deps` はダウンロードした tarball から CLI の `optionalDependencies` を設定する
- 公開は CI から直接 `bun publish` を使う。コンパイラの tarball を公開した後、`bun publish --recursive` で全 workspace の公開対象を依存順に公開する。`private` のルート・ビューア・example は Bun が除外する。ビューアだけをビルドし、TS ソースと必要なアセットを配布する
- 認証には GitHub Actions の `NPM_TOKEN` シークレットを `NPM_CONFIG_TOKEN` として公開ステップだけに渡す。公開後に GitHub Release（PR からの自動の変更点つき）を作る
- `0.3.0-rc.1` のように `-` のつくタグは npm の `next` に公開し、GitHub Release もプレリリースにする
- `bun publish --recursive` と `--tolerate-republish` が公開済みの版を処理するので、途中で失敗したら同じワークフローを再実行する。通常の通信・認証エラーは失敗として止まる
- `release.ts` はタグ `0.0.0` と、版を適用する前のコンパイラ梱包を拒否する。手元からは公開せず、タグの CI から公開する
- 古い版を直すときだけ、タグからブランチを作る（`git switch -c release/0.2.x 0.2.0`）。そこで直して `0.2.1` を打つ

## プレビューの仕組み

- `mekuru-server`（`pkgs/cli/src/server.ts`）が XML を監視し `mekuru-compiler - --emit-preview` の標準入力に渡す
- コンパイラは、診断・時間区間・描画データを JSON で返す（動画・PCM は作らない）。XML は内部で整形し、診断とタイムラインの行番号に使う
- プレビューの JSON と `@mekuru/cli/protocol` から、未使用の `Compilation.source`・`Preview.source`・`Timeline.lines` を削除した。外部の利用側もこれらのフィールドを参照しない形に更新する
- コンパイルは一つずつ。待っている入力は最新だけ残す
- 成功した結果を SSE（`state`）で送る。失敗時は最後の成功結果を保つ
- 時間・配置・文字のパスは書き出しと共有し、ブラウザで計算し直さない
- `src` のない音声（下書き）は長さを持たず、読み上げの部品が見積もりの `<dur>` で包む（書き出しではエラー）
- `--run` のコマンドには `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=1` を渡す（`bun --hot` が再実行のたびにターミナルを消し、URL と更新のログが見えなくなるため）。更新の結果（かかった時間・診断）はサーバーがターミナルに書く
- コンパイル中（`status: "building"`）は、プレビュー全体にリロードのマークを重ねる

## 内部構造

- 時間の木と描画順（枝をまたぐ `z` も）はコンパイル時に決める
- 文字: `cosmic-text` でフォント選択・文字組み・折り返し、同ライブラリが公開する `Skrifa` で輪郭を取得し、`tiny-skia` で描画する。配置は論理座標で計算し、プレビューと動画で同じ輪郭を使う。中央揃えの改行バランス調整は mekuru-compiler 側で行う
- `@mekuru/speech/engine`: `httpClient`（HTTP 通信と接続エラー）・`limit`（同時実行数）
- キャラクター: `pkgs/create/src/character.ts` のカタログから TSX を生成する。立ち絵は `template/assets/character/<id>.png`
- ビューア（`pkgs/viewer/src/`）: `main.tsx`（入口）・`view/`（React の部品と画面の操作）・`logic/`（状態と計算。`view/` を読まない）
- ビューアの表示: `view/App.tsx`（接続待ちと画面構成）・`view/preview/`（Preview と Stage）・`view/timeline/`（Timeline・TimelineRuler・TimelineContent・ResizeHandle）・`view/status/`（StatusBar・Transport・ZoomSlider）。共通の Tooltip は `view/components/`、クラス名の結合は `clsx`
- ビューアのロジックは `logic/` の jotai の atom にまとめ、カスタムフックは使わない。部品は atom を読み書きするだけ
  - `server.ts`: サーバーの状態（SSE は atom の `onMount` でつなぐ）
  - `playback/atoms.ts`: 再生位置・再生（`requestAnimationFrame` のループは `playingAtom` の書き込みが回す）・キー（`keysAtom` の `onMount`）
  - `timeline/atoms.ts`: タイムライン内で完結する状態と操作（拡大とスクロール・幅・配置・高さ・指定時刻への追従）。再生側からも使うため、再生側を参照しない
  - `timeline/actions.ts`: 再生位置と連携する操作（シーク・拡大）と DOM 接続（幅の監視・ホイール）。再生側と `timeline/atoms.ts` を参照する
  - `stage.ts`: プレビューの縮尺と、再生位置で映す要素
  - 要素の大きさやホイールは、書き込み用 atom を React 19 の ref（片付け関数を返す）に渡して受け取る
  - 共通処理: `formatTime.ts`（時刻表示）・`math.ts`（数値計算）・`observe.ts`（要素のサイズ監視）。DTO は `@mekuru/cli/protocol` から直接 import する
- Timeline: `logic/timeline/model.ts`（配置の計算）・`view/timeline/TimelineRuler.tsx`（上に固定する時間の目盛り）・`view/timeline/TimelineContent.tsx`（縦にスクロールする本体の静的な SVG）
- Rust: `lang/xml.rs` が XML をタグの木にし、`layout/` が文書全体を一つの taffy の木で配置してから時間の木（`ir::Node` と `ir::Elem`）にする。子に自分の時間を持つものがある入れ物だけがノードになり、時間を持たない描画は直前の要素にまとめる。長さのあるなし（`ir::Dur::Fill` が長さなし）も、タグと子からここで決める（`Ctx::length`）。`<dur>`・`<repeat>` は taffy の木に入れず、子を親の子として置く（`layout::boxes`。時間だけのノードで、`<repeat>` は `ir::NodeKind::Repeat`）。`<dur>` は直下の子の長さを置き換え、属性がなく子が 1 つならその子に畳み込む（`VNode::unfold`）。`<hold>` は、時間では素材の中、空間では素材の親の上に置くノードになる（`ir::Node::hold`）。`<speed>`・`<cut>` は素材の `ir::MediaSrc::speeds` になる（`<cut>` は速さ ∞）。`lang/expand.rs` は `<repeat>` の中の名前・参照を検査し、`schedule.rs` が時刻を決める（`max` と `+` の式を依存グラフの順に解く。輪は E510、届かない参照は E504 で、どちらも解き直さない）
- 時刻はフレームの整数（`i64`）。実数のフレームは素材の再生位置（`schedule::SrcMap`）とフェードだけで、素材が位置に着く時刻は `schedule::up` で切り上げる。秒にするのは、ffmpeg・音声のミックス・プレビューの JSON との境目だけ（`media::Fps::secs`）
- TSX の部品は `fps()` で `<mekuru fps>` を読める（`writeXml` が `<mekuru>` の中を展開している間だけ）。読み上げの長さや口パクは、これで秒からフレームにする
- 速さを変えた音声: 書き出しの時に、素材の PCM のキャッシュから ffmpeg の `atempo`（音程を保つ）でその部分を作り、PCM のキャッシュに置く（`pipeline::audio_tracks`）。プレビューはブラウザの `playbackRate` で再生する
- TSX → XML: `pkgs/core/src/xml.ts` が部品を展開し、省略（`delay`・色名など）を補って厳格な XML にする。`lang/xml.rs`・`lang/attrs.rs` は 1 通りの書き方だけを読む
