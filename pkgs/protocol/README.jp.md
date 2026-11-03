# @mekuru/protocol

コンパイラ出力とサーバー状態を共有するTypeScript型です。実行時依存はありません。cliとviewerがこの通信契約を参照します。

`TimelineCompilation` は整数フレーム区間、有理数 `FrameRate`、台本ID、反復情報を表します。プレビューの同期には `PreviewEvent` の `snapshot`・`status`・`patch` を使います。
