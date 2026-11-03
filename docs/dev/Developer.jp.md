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
- [pkgs/narrator](../../pkgs/narrator/README.jp.md): 自作ナレータの立ち絵・口パク・字幕・PSD 素材準備
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

`mekuru-server` が XML を監視し、`mekuru-compiler - --preview-worker` を常駐させます。標準入出力の1行が1件の JSON 要求・応答です。要求は `version`・`xml`・CLI が保持する描画ハッシュ `knownResources`、応答は軽量なシーン全体・診断・未保持の描画リソース・キャッシュ統計です。`--emit-preview` の単発・展開済み JSON 出力は維持します。コンパイラ・CLI・viewer は同時に更新してください。

- XML 解析・配置・時間計算は毎回全体を処理します。フォント・字形・文字寸法・メディア情報・`ViewOp` から描画への変換は再利用します。表示要素に複数の描画がまとめられていても、リソースは元の `ViewOp` 単位です。
- 描画 LRU の推定サイズ上限は 64 MiB。フォントブックは最大4個で、各ブックの寸法キャッシュは 4 MiB、字形は 16 MiB、probe・画像寸法は各 1 MiB です。処理中の応答とフォントシステム自体のメモリは別です。ファイルはパス・サイズ・更新時刻で検証し、入力が参照するフォントファイルは配置前に読み込みます。診断の行番号は今回の整形済み XML から作ります。
- 内部の連番 ID は維持し、別のプレビューキーで識別します。スコープ付き XML `id`、同じ親の変更のない部分木、その間の同数・同タグの要素の順に照合します。曖昧な追加・削除には新しいキーを付け、ワーカー再起動時も別の名前空間にします。描画順はキーと独立です。
- コンパイルは逐次実行し、待機中は最新入力だけを保持します。古い結果を捨てた場合、そのリソースを保持済みとして扱いません。異常終了は最新入力で一度だけ再起動し、再失敗時は最後の成功プレビューを残してエラーを表示します。
- `/api/events` は初回・再接続に `snapshot`、更新中・失敗・診断だけの変更に `status`、成功した変更にバージョン付き `patch` を送ります。差分には要素・タイムラインの追加／更新／削除、順序、描画リソースの追加／削除が含まれます。イベントは一度シリアライズして全クライアントに配信し、全体の方が小さければ snapshot を使います。`/api/preview` は確認用の snapshot を返し、旧 drawing/path POST エンドポイントは廃止します。
- viewer は差分を一括適用して未変更の要素・リソース参照を維持します。基準バージョン不一致や欠落リソースは再接続で同期します。CLI・viewer は現在参照するリソースだけを保持します。状態通知では区間インデックス・タイムライン配置を作り直しません。再生状態・ズームは維持し、尺が短くなった場合だけ保存済み再生位置を範囲内に収めます。
- 仮音声は推定尺の `<dur>` で囲みます。動画書き出しには完成した音声が必要です。`--run` に `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=1` を渡すと再読み込みのログを残せます。

素材単独の変更監視、XML・配置・時間計算の増分化、再生中の最適化は対象外です。素材は次回コンパイル時に検証し、システムフォントを追加した場合はサーバーを再起動してください。

ビルド後に `bun scripts/preview-benchmark.ts 500 10` を実行すると、500字幕の初回と10回の局所編集について単発・常駐を比較できます。生成／往復時間、描画キャッシュ命中数、応答・SSE のサイズ、Bun 上の JSON デコード＋viewer reducer 適用時間を出力します。`MEKURU_BENCH_OUT=/tmp/benchmark` を指定するとブラウザ計測用のイベントも保存します。通信量は圧縮前、適用時間には描画・paint を含みません。

ローカルの debug ビルド（英語500字幕、640×360、毎回1字幕を変更）では、単発コンパイルの中央値 271 ms、常駐初回の往復 253 ms、反復編集の往復中央値 11 ms（コンパイラ内 9.4 ms）でした。反復編集は描画 499/500 件にヒットし、1リソースだけを送り、SSE は約 32.4 kB（単発の全体出力は 16.8 MB）。Chromium での2回の計測では、JSON デコード＋reducer 適用の中央値は初回 15〜77 ms、反復 0.7〜1.3 ms でした。この入力に対する値で、以前の 11.3 MB の入力との直接比較ではありません。実ブラウザでは字幕修正・追加・コンパイル失敗・再同期後も動画／音声 DOM が維持され、状態通知の描画転送がゼロであることを確認しています。実際のワーカーを強制終了した場合も次の編集で復旧しました。

## 内部構造

- TSX → XML: [core/src/xml.ts](../../pkgs/core/src/xml.ts)。部品を展開し、省略・別名を正規化
- XML の解析: [compiler/src/lang](../../pkgs/compiler/src/lang)。厳格な属性・参照の検査
- 配置: [compiler/src/layout](../../pkgs/compiler/src/layout)。taffy で文書全体を配置し、時間の木に変換
- 時間の計算: [compiler/src/schedule/mod.rs](../../pkgs/compiler/src/schedule/mod.rs)。依存順に解決。循環は E510、到達できない参照は E504
- 描画: [compiler/src/render](../../pkgs/compiler/src/render)。cosmic-text で組版、Skrifa で文字輪郭、tiny-skia で描画
- 出力: [compiler/src/pipeline.rs](../../pkgs/compiler/src/pipeline.rs)。音声の速度変更・ミックス・エンコード
- ビューア: [viewer/src/view](../../pkgs/viewer/src/view) は UI、[viewer/src/logic](../../pkgs/viewer/src/logic) は状態と計算

時間の木・配置・描画順はコンパイル時に確定します。時刻は整数フレームで、秒への変換は ffmpeg・音声ミックス・プレビュー JSON との境界で行います。`<dur>`・`<repeat>` は配置に影響せず、`<hold>` の表示内容は素材の親を基準に配置します。

TSX の `fps()` は `<mekuru>` の展開中だけ使えます。音声の速度変更は書き出しで `atempo`、プレビューで `playbackRate` を使います。

ビューアの状態は Jotai の atom に置き、`logic/` は `view/` に依存しません。コンポーネントは atom を読み書きし、カスタムフックは使いません。共通の DTO は `@mekuru/protocol`、DOM の接続と解除は React の ref で扱います。

## パッケージの責務

`core` はJSX・XMLと構築コンテキスト、`audio` は音声素材とWAV処理、`speech` は合成の準備とキャッシュを担当します。各エンジンは固有のHTTP API、`narrator` は立ち絵・字幕、`protocol` は実行時依存のない通信型、`platform` はOS共通処理を担当します。viewerはcliではなくprotocolに依存します。

API移行: `AudioSource`・`Audio`・`readAudio` は `@mekuru/audio`、`joinWavs` は `@mekuru/audio/wav`、通信型は `@mekuru/protocol` からimportします。旧入口の再exportはありません。
