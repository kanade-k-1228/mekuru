# TSX の書き方

[English](Component.jp.md)

台本は Bun で実行し、組み込み要素だけの XML に展開します。小文字のタグは[組み込み要素](Syntax.jp.md)、大文字のタグは関数コンポーネントです。

```text
src/main.tsx → .mekuru/main.xml → video.mp4
    Bun         mekuru-compiler
```

## プロジェクトを作る

```sh
bun create @mekuru my-video --voice zunda,metan
cd my-video
bun install
```

作成オプションは [@mekuru/create](../../pkgs/create/README.jp.md)、最初の台本は [チュートリアル](../../example/README.md) を参照してください。

- `src/main.tsx`: 台本
- `src/parts.tsx`: 字幕などの共通部品
- `src/character/`: 選択したキャラクターの読み上げ・立ち絵
- `assets/`: 画像・動画・音声
- `configs/`: 投稿設定とサムネイル
- `.mekuru/`: 生成した XML と音声キャッシュ

## 台本

`writeXml(path, video)` は部品を展開して XML を保存します。読み上げ部品は、音声がなければ下書きを出し、合成後に更新します。使い方と JSX の設定は [@mekuru/core](../../pkgs/core/README.jp.md)、完成例は [tutorial/main.tsx](../../example/tutorial/main.tsx) にあります。

属性には数値 `{30}`、文字列 `"100%"`、真偽値 `closed`、配列 `{[0, 80]}` を指定できます。`false`・`null`・`undefined` は出力されません。[XML](Syntax.jp.md#xml中間形式) では値の表記を統一します。

## 部品

部品は props を受け取り、要素を返す関数です。`async` にでき、配列・条件分岐・フラグメントを使えます。hooks や状態は持ちません。

次は、音声・立ち絵・字幕を一つのセリフとして扱う部品です。型と補助部品は [example/src/parts.tsx](../../example/src/parts.tsx) にあります。

```tsx
// example/src/parts.tsx（抜粋）
export const Sasara = ({ children, face, show, ...time }: Line) => (
  <stack {...time}>
    <sasara.Talk face={face}>
      <Voicevox {...voice}>{children}</Voicevox>
    </sasara.Talk>
    <Subtitle>{children}</Subtitle>
    {show}
  </stack>
);
```

`<stack>` 内の音声が長さを決め、字幕・立ち絵・`show` に渡した要素を同時に表示します。声は [Voicevox](../../pkgs/voicevox/README.jp.md)、立ち絵は [portrait](Portrait.jp.md) を参照してください。

### コードを表示する

`<text pre>` は改行と空白を保持し、共通のインデントと前後の空行を除きます。行番号や強調枠の実装例は [parts.tsx の Code・CodeMark](../../example/src/parts.tsx) にあります。行の高さは `size × line-height` です。

## プレビュー

```sh
bun preview   # http://localhost:3333
```

保存するたびにプレビューとタイムラインを更新します。エラーはブラウザに表示し、最後の成功結果を保持します。

- 再生・一時停止: Space
- 1フレーム移動: ← / →
- 1秒移動: Shift + ← / →
- シーク: タイムラインをクリック・ドラッグ。クリップのクリックは開始位置へ移動
- 拡大: 右下のスライダー、Ctrl + ホイール
- 高さ変更: タイムライン上端をドラッグ。設定はブラウザに保存

`bun preview --no-open` でブラウザの自動起動を抑止します。常に抑止する場合は `MEKURU_OPEN=0`、一時的に開く場合は `--open` を指定します。VS Code では表示された URL を選んで Integrated Browser で開けます。

時間・配置・文字組みは書き出しと共通です。ブラウザの描画や動画のシーク精度には差があります。速度変更は音程を保って再生し、1/16〜16倍を超える部分はシークで追従します。

## 書き出す

```sh
bun run build                     # video.mp4
bun run build --preview           # 半分の解像度・15 fps
bun run build --from 60 --to 90    # 60〜90秒
```

`--preview` も同じファイルを上書きします。投稿前に通常の設定で書き出してください。

## コマンド

生成プロジェクトの `preview` は `mekuru-server --run 'bun --hot src/main.tsx' .mekuru/main.xml`、`build` は `bun src/main.tsx && mekuru-compiler .mekuru/main.xml -o video.mp4` を実行します。オプションと素材の基準フォルダは [@mekuru/cli](../../pkgs/cli/README.jp.md) を参照してください。
