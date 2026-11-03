# @mekuru/protocol

コンパイラ出力とサーバー状態を共有するTypeScript型です。実行時依存はありません。cliとviewerがこの通信契約を参照します。

`TimelineCompilation` は整数フレーム区間、有理数 `FrameRate`、台本ID、反復情報を表します。プレビューの同期には `PreviewEvent` の `snapshot`・`status`・`patch` を使います。

単発・常駐プレビューの文字は内容・配置・スタイルを持つ `TextOp` で、viewer が HTML/CSS で描画します。`fontSrc` と `fontRevision` はプロジェクト内のフォントを識別します。画像・動画・音声もリビジョンを持ちます。動画書き出しには従来の Rust 組版・パス描画を使います。コンパイラ・CLI・viewer は同時に更新してください。
