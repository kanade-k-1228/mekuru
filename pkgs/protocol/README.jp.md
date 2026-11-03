# @mekuru/protocol

コンパイラ出力とサーバー状態を共有するTypeScript型です。実行時依存はありません。compilerパッケージとviewerがこの通信契約を参照します。

`TimelineCompilation` は整数フレーム区間、有理数 `FrameRate`、台本ID、反復情報を表します。プレビューの同期には `PreviewEvent` の `snapshot`・`status`・`patch` を使います。

単発・常駐プレビューの文字は内容・配置・スタイルを持つ `TextOp` で、viewer が HTML/CSS で描画します。`fontSrc` と `fontRevision` はプロジェクト内のフォントを識別します。画像・動画・音声もリビジョンを持ちます。動画書き出しには従来の Rust 組版・パス描画を使います。コンパイラと埋め込み viewer は同時に更新してください。

ワーカー要求は `knownResources` の列挙から `baseVersion` の受理通知へ変わりました。応答は `previewVersion` と `update`（snapshot・patch・null）、Rust の差分生成時間 `stats.diffMs` を持ちます。`previewVersion: null` はコンパイル失敗、成功してシーンが同じなら受理済みの版を維持し更新を送りません。ワーカーは受理済みシーンと候補1件を保持し、破棄した応答を差分の基準にしません。再起動・不明な基準では snapshot を返します。以前の全体シーン応答を置き換えるためコンパイラと外部ツール を同時更新してください。ブラウザの `PreviewEvent` と単発の `Compilation` は維持します。

ネイティブの `--serve` は同一プロセス内でコンパイルし、`PreviewEvent` を直接 WebSocket 配信します。ビューアはコンパイラへ埋め込んで同時に配布します。JSON Lines のワーカー型は外部ツール・計測用です。

`/api/ws` の WebSocket で、1メッセージにつき1件の `PreviewEvent` JSON テキストを送ります。基準バージョンが合わない場合、viewer は `PreviewCommand` の `{"type":"resync"}` を送り、同じ接続で snapshot を再取得します。切断・再同期のタイムアウト時は再接続します。旧 `/api/events` SSE エンドポイントは廃止し、コンパイラと埋め込みビューアを同時更新してください。
