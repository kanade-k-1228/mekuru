# 開発

[English](Developer.md)

## リポジトリ構成

- [pkgs/tsx](../../pkgs/tsx/README.jp.md): TSX の型・JSX ランタイム・XML 出力
- [pkgs/core](../../pkgs/core/README.jp.md): Rust の動画コンパイラ、ネイティブのプレビューサーバー、埋め込み UI、npm 用の起動スクリプト
- [pkgs/viewer](../../pkgs/viewer/README.jp.md): React のビューア。ビルド先は `pkgs/core/viewer/`
- [pkgs/create](../../pkgs/create/README.jp.md): プロジェクト生成
- [pkgs/audio](../../pkgs/audio/README.jp.md): 音声素材と WAV 処理
- [pkgs/speech](../../pkgs/speech/README.jp.md): VOICEVOX・COEIROINK・Style-Bert-VITS2・VoiSona Talk の読み上げ部品と、エンジンを追加する API
- [pkgs/narrator](../../pkgs/narrator/README.jp.md): 自作ナレータの立ち絵・口パク・字幕・PSD 素材準備
- [pkgs/upload](../../pkgs/upload/README.jp.md): YouTube・ニコニコ動画への投稿コマンド
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

TypeScript パッケージはソースを直接実行するため、変更後のビルドは不要です。コンパイラ変更後は `cargo build --workspace --locked`、ビューア変更後は埋め込み直すため `bun run build` を実行します。コンパイラの選択順は [core](../../pkgs/core/README.jp.md) を参照してください。

ビューアの開発は、別々のターミナルで次を起動します。

```sh
bun run --cwd example preview --no-open
bun run --cwd pkgs/viewer dev
```

開発サーバーは `http://localhost:5173` からポート3333へ API を転送します。

型設定はルートとビューアの2つです。生成プロジェクト用は `pkgs/create/template/tsconfig.json` に置きます。Project References・増分ビルド・パッケージごとの JS/型定義生成は使いません。型チェックはビルド前にも実行できます。`bun run test` はネイティブサーバーの統合テスト前に実行ファイルと UI をビルドします。

## リリース

通常の変更は作業ブランチから `main` へ PR で取り込みます。版は `v` なしの Git タグで管理し、リポジトリ内の版は `0.0.0` のままにします。全パッケージは同じ版で公開し、1.0 までは機能追加・破壊的変更で minor、修正で patch を上げます。

```sh
git switch main
git pull
git tag 0.3.0
git push origin 0.3.0
```

[packages.yml](../../.github/workflows/packages.yml) が検査・Rust 1.89 の確認・8環境のビルドと起動確認を実行します。8環境は x64 と arm64 それぞれの Linux（glibc・musl）・macOS・Windows です。タグでは release、それ以外は debug ビルドです。依存関係は `bun ci`、Bun の版は `packageManager` に従います。

タグの公開処理:

1. `release.ts stamp` が版を manifests と lockfiles に設定する。変更はコミットしない。
2. 各 OS のジョブでビューアをビルドし、Rust 実行ファイルへ埋め込んでから `pack` で npm tarball にする。
3. `deps` が `@mekuru/core` の `optionalDependencies` を設定し、バイナリと公開 workspace を `bun publish` で公開する。`private` は除外する。
4. 変更点付きの GitHub Release を作成する。

認証は公開ステップだけで `NPM_TOKEN` を `NPM_CONFIG_TOKEN` に渡します。`0.3.0-rc.1` のようなタグは npm の `next` と GitHub のプレリリースになります。手元からは公開しません。

失敗時は同じワークフローを再実行できます。`--tolerate-republish` が公開済みの版を処理します。`release.ts` は版が `0.0.0` の公開準備を拒否します。旧版の修正は該当タグからブランチを作り、patch を上げます。

## プレビューの仕組み

`mekuru-compiler <xml> --serve` が Tokio/Axum の HTTP サーバー、ファイル監視、コンパイラ専用スレッドを同一プロセス内で動かします。ビルド済みビューアも実行ファイルへ埋め込みます。既存 XML のプレビューに Bun は不要です。`--run` は引き続きプロジェクトフォルダで台本生成コマンドを実行します。

シーン・描画リソースは Arc で共有し、待機中は最新 XML だけを保持します。専用スレッドでフォント・素材・描画・識別キーのキャッシュを再利用し、コンパイル中も HTTP と素材読み込みを非同期で受け付けます。
- 続けて2回読んだ内容が一致したら保存を受理するので、原子的な置き換えや短い分割書き込みは1回にまとまります。新しい通知は進行中の読み取りを取り消し、一時的な読み取り失敗は再試行します。`/mnt/` 配下はポーリングで監視します。
- XML 解析・配置・時間計算は毎回全体を処理します。フォント・文字寸法・メディア情報・`ViewOp` から描画への変換は再利用します。表示要素に複数の描画がまとめられていても、リソースは元の `ViewOp` 単位です。
- 描画・文字寸法・字形・probe・画像寸法のキャッシュは、サイズ上限付きの LRU です。サーバーは最後に配信したシーンも保持し、描画リソースはキャッシュと Arc で共有します。ファイルはパス・サイズ・更新時刻で検証し、入力が参照するフォントファイルは配置前に読み込みます。診断の行番号は今回の整形済み XML から作ります。
- 内部の連番 ID は維持し、別のプレビューキーで識別します。スコープ付き XML `id`、同じ親の変更のない部分木、その間の同数・同タグの要素の順に照合します。曖昧な追加・削除には新しいキーを付け、panic 後に作り直したセッションも別の名前空間にします。描画順はキーと独立です。
- コンパイルは逐次実行し、最新 XML の版と一致する結果だけを公開します。回復可能な panic はキャッシュを作り直して一度だけ再試行し、コンパイル失敗時は最後の成功シーンを維持します。
- `/api/ws` は WebSocket の JSON テキストメッセージで、接続時に `snapshot`、更新中・失敗・診断だけの変更に `status`、成功した変更にバージョン付き `patch` を送ります。Rust は直前に配信したシーンへの patch を送り（それがないときだけ snapshot）、一度シリアライズして配信します。上限付きのキューからあふれた、受信の遅い接続には snapshot を送り直します。ブラウザから `{"type":"resync"}` を送ると同じ接続で再同期できます。Ping/Pong で接続を確認し、切断時は再接続します。`/api/preview` は現在の snapshot を返します。コンパイルが成功するまで `preview` は `null` です。
- `/files/` は HEAD・バイト範囲に対応して素材・フォントをストリーム配信します。シンボリックリンクも含めた実パスがプロジェクト内に収まることを確認します。`--run` の標準エラーは保持量を制限し、XML 保存で消去します。終了時はスクリプトの子プロセスも停止します。
- viewer は差分を一括適用して未変更の要素・リソース参照を維持します。基準バージョン不一致や欠落リソースは同じ WebSocket で snapshot を要求し、一定時間内に再同期できなければ再接続します。サーバー・viewer は保持するシーンに必要なリソースを維持します。状態通知では区間インデックス・タイムライン配置を作り直しません。再生状態・ズームは維持し、尺が短くなった場合だけ保存済み再生位置を範囲内に収めます。
- 仮音声は推定尺の `<dur>` で囲みます。動画書き出しには完成した音声が必要です。`--run` に `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=1` を渡すと再読み込みのログを残せます。

プレビューの文字はコンパイラが計算した位置・幅・スタイルを受けて HTML/CSS で描画し、図形・画像は SVG、動画・音声はブラウザのメディア要素を使います。文字幅・改行・縁取りは書き出しと差が出る場合があります。個別・共通指定のプロジェクト内フォントをリビジョン付きの `/files/` URL から読み込み、読み込み中・失敗時は代替フォントで表示します。ブラウザはソースとリビジョンでフォントを共有し、最後の表示参照がなくなると解放します。動画書き出しは Rust の組版・文字輪郭描画を維持します。上記の字形キャッシュは書き出し用で、HTML プレビューでは使いません。

素材単独の変更監視、XML・配置・時間計算の増分化、再生中の最適化は対象外です。素材は次回コンパイル時に検証し、システムフォントを追加した場合はサーバーを再起動してください。

`bun pkgs/core/test/preview-latency.ts 500 10 ja` はネイティブサーバーを起動し、原子的なファイル書き込みから ready WebSocket メッセージ受信までを測ります。待機・コンパイルを含み、ブラウザ描画は含みません。`MEKURU_COMPILER` で実行ファイルを指定できます。初回は全体 snapshot を送ります。

CI の各 OS ジョブでも UI 埋め込み後にネイティブサーバーのテストを実行します。

## 内部構造

- TSX → XML: [tsx/src/xml.ts](../../pkgs/tsx/src/xml.ts)。部品を展開し、省略・別名を正規化
- XML の解析: [core/src/lang](../../pkgs/core/src/lang)。厳格な属性・参照の検査
- 配置: [core/src/layout](../../pkgs/core/src/layout)。taffy で文書全体を配置し、時間の木に変換
- 時間の計算: [core/src/schedule/mod.rs](../../pkgs/core/src/schedule/mod.rs)。依存順に解決。循環は E510、到達できない参照は E504
- 描画: [core/src/render](../../pkgs/core/src/render)。cosmic-text で組版、Skrifa で文字輪郭、tiny-skia で描画
- 出力: [core/src/pipeline.rs](../../pkgs/core/src/pipeline.rs)。音声の速度変更・ミックス・エンコード
- ビューア: [viewer/src/view](../../pkgs/viewer/src/view) は UI、[viewer/src/logic](../../pkgs/viewer/src/logic) は状態と計算

時間の木・配置・描画順はコンパイル時に確定します。時刻は整数フレームで、秒への変換は ffmpeg・音声ミックス・プレビュー JSON との境界で行います。`<dur>`・`<repeat>` は配置に影響せず、`<hold>` の表示内容は素材の親を基準に配置します。

TSX の `fps()` は `<mekuru>` の展開中だけ使えます。音声の速度変更は書き出しで `atempo`、プレビューで `playbackRate` を使います。

ビューアの状態は Jotai の atom に置き、`logic/` は `view/` に依存しません。コンポーネントは atom を読み書きし、カスタムフックは使いません。DOM の接続と解除は React の ref で扱います。

## パッケージの責務

`types` はJSX・XMLと構築コンテキスト、`core` はネイティブコンパイラとプレビューサーバー、`audio` は音声素材とWAV処理、`speech` は合成の準備・キャッシュと各エンジンの HTTP API を担当します。`narrator` は立ち絵・字幕、`upload` は投稿コマンドを担当します。プレビューの通信契約の型は [viewer/src/protocol.ts](../../pkgs/viewer/src/protocol.ts) にあり、ネイティブサーバーがそれを Rust で実装します。
