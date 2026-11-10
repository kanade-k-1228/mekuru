# TSX の書き方

[English](Component.md)

台本は Bun で実行し、組み込み要素だけの XML に展開します。小文字のタグは[組み込み要素](Syntax.jp.md)、大文字のタグは関数コンポーネントです。

```text
src/main.tsx → .mekuru/main.xml → video.mp4
    Bun         mekuru-compiler
```

## プロジェクトを作る

```sh
bun create @mekuru my-video
cd my-video
bun install
```

作成オプションは [@mekuru/create](../../pkgs/create/README.jp.md)、最初の台本は [チュートリアル](../../example/README.md) を参照してください。

既定は irodoru サンプルです。プレビュー前に別のターミナルで `bun run irodoru` を実行します（Docker が必要）。VOICEVOX は `bun run voicevox` で起動できます（既定: `http://127.0.0.1:8080`、変更は `MEKURU_IRODORU_URL`）。空の台本は `--template empty` で作成できます。

- `src/main.tsx`: 台本
- `src/parts.tsx`: 字幕などの共通部品（必要に応じて追加）
- `assets/`: 画像・動画・音声
- `configs/`: 投稿設定とサムネイル
- `.mekuru/`: 生成した XML と音声キャッシュ

## 台本

`writeXml(path, video)` は部品を展開して XML を保存します。読み上げ部品は、音声がなければ下書きを出し、合成後に更新します。使い方と JSX の設定は [@mekuru/tsx](../../pkgs/tsx/README.jp.md)、完成例は [tutorial/main.tsx](../../example/tutorial/main.tsx) にあります。

属性には数値 `{30}`、文字列 `"100%"`、真偽値 `closed`、配列 `{[0, 80]}` を指定できます。`false`・`null`・`undefined` は出力されません。[XML](Syntax.jp.md#xml中間形式) では値の表記を統一します。

## 部品

部品は props を受け取り、要素を返す関数です。`async` にでき、配列・条件分岐・フラグメントを使えます。hooks や状態は持ちません。型は `@mekuru/tsx` の `FC<Props>` で付けます。

次は、音声・立ち絵・字幕を一つのセリフとして扱う部品です。型と補助部品は [example/src/parts.tsx](../../example/src/parts.tsx) にあります。

```tsx
// example/src/parts.tsx（抜粋）
export const Zundamon: FC<Line> = async ({ text, say, face, children, ...time }) => {
  const line = await Speech.prepare({ ...voice, text: say ?? text });
  return (
    <dur len={line.audio.len} {...time}>
      <stack>
        <Audio source={line.audio} />
        <zundamon.Talk source={line.audio} face={face} />
        <Subtitle text={say === undefined ? line.display : await subtitleText(text)} />
        {children}
      </stack>
    </dur>
  );
};
```

```tsx
<Zundamon face="smile" text="長さは、セリフに合わせて決まります。">
  <Label x={708} y={650} text="長さは自動！" />
</Zundamon>
<Zundamon text="今日の天気" say="きょうのてんき" />
```

`Speech.prepare` で一度準備した音声素材を `Audio` と `Talk` に渡します（`Audio` は `@mekuru/tsx` から import）。`line.display` は字幕の文字列で、`\n` で改行します。`Subtitle` は装飾だけを加える通常の `text` です。`text` は字幕、`say` は読み上げる文で、`say` を省くと `text` を読み上げます。外側の `<dur>` でセリフの長さを決めるので、子要素はそのセリフの間だけ表示されます。詳しくは [ナレータの組み立て](../../pkgs/narrator/README.jp.md) を参照してください。

### コードを表示する

`<text>` は `text` の文字列を改行・空白・字下げも含めてそのまま表示します。コードは文字列のまま `text` に渡します。行番号や強調枠の実装例は [parts.tsx の Code・CodeMark](../../example/src/parts.tsx) にあります。行の高さは `size × line-height` です。

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

`bun preview --no-open` でブラウザの自動起動を抑止します。常に抑止する場合は `MEKURU_OPEN=0` を設定します。VS Code では表示された URL を選んで Integrated Browser で開けます。

時間・配置は書き出しと共通です。文字はブラウザが描画するため、文字幅・改行・縁取りや動画のシーク精度には差が出る場合があります。速度変更は音程を保って再生し、1/16〜16倍を超える部分はシークで追従します。

## 書き出す

```sh
bun run build                     # video.mp4
bun run build --preview           # 半分の解像度・15 fps
bun run build --from 60 --to 90    # 60〜90秒
```

`--preview` も同じファイルを上書きします。投稿前に通常の設定で書き出してください。

## コマンド

生成プロジェクトの `preview` は `mekuru-compiler --serve --run 'bun --hot src/main.tsx' .mekuru/main.xml`、`build` は `bun src/main.tsx && mekuru-compiler .mekuru/main.xml -o video.mp4` を実行します。オプションと素材の基準フォルダは [@mekuru/core](../../pkgs/core/README.jp.md) を参照してください。
