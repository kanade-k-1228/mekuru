# TSX の書き方

```
src/main.tsx ──bun──▶ .mekuru/main.xml ──mekuru-compiler──▶ video.mp4
```

- 台本は TSX で書き、Bun で実行する（JSX のランタイムは [Hono](https://hono.dev/docs/guides/jsx)）
- 小文字の要素: [組み込みの要素](Syntax.md)
- 大文字の要素: 部品（関数コンポーネント）。props を受け取り、組み込みの要素を返す
- 実行すると部品が展開され、組み込みの要素だけの XML が書き出される

## プロジェクトを作る

```
$ bun create @mekuru my-video --voice zunda,tsukuyomi
```

- 指定しなかったもの（フォルダ・キャラクター・アップロード先）は対話で聞く
- `--voice`: キャラクター（`zunda`・`metan` など。一覧は `--help`）かエンジン（`voicevox`・`coeiroink` など）。既定は選ばない
- `--yes`: 何も聞かずに既定値を使う（端末から実行していないときも同じ）
- `--upload`: アップロード先（`youtube`・`niconico`）。`upload:<先>` のスクリプトと設定のファイル（`configs/youtube.yaml` など）が入る（[動画の投稿](Upload.md)）
- `--force`: 空でないフォルダに作る
- 最後に、ffmpeg と読み上げエンジンが使えるかを表示する

```
my-video/
  src/main.tsx              台本
  src/parts.tsx             部品（字幕・立ち絵など）
  src/character/zunda.tsx   選んだキャラクターのセリフ <Zunda> と立ち絵 <ZundaPortrait>
  assets/                   画像・動画・音声
  configs/                  投稿の設定とサムネイル（アップロード先を選んだとき）
  .mekuru/                  書き出した XML と音声のキャッシュ
```

## 台本

- チュートリアルで作る台本（[`example/tutorial/main.tsx`](../../example/tutorial/main.tsx)）の一部。`Zunda`・`Metan` はプロジェクト作成時に選ぶ

```tsx
// example/tutorial/main.tsx（抜粋）
import { writeXml } from "@mekuru/core";
import { Zunda, ZundaPortrait } from "./character/zunda";
import { Metan, MetanPortrait } from "./character/metan";

const Video = () => (
  <mekuru size="1920x1080" fps={30}>
    <rect w="100%" h="100%" fill="#141C26" />
    <ZundaPortrait x="90%" h="45%" />
    <MetanPortrait x="10%" h="45%" />
    <stack>
      <text x="50%" y="35%" anchor="center" size={90}>
        はじめての動画
      </text>
      <seq>
        <Zunda>こんにちは、ずんだもんなのだ。</Zunda>
        <Metan>今日は Mekuru で動画を作るわ。</Metan>
      </seq>
    </stack>
    …
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
```

- `writeXml` は、部品（非同期の読み上げなども）を展開して XML を書き出す
- 未合成のセリフは、見積もった長さの下書きで先に書き出し、合成後に書き直す
- 属性の値
  - 数値 `{30}`、文字列 `"100%"`、真偽値 `closed`、リスト `{[0, 80]}`
  - XML には 1 通りの書き方の文字列（`"30"` `"true"` `"0 80"`）で書き出される（[中間形式](Syntax.md#xml中間形式)）
  - `false`・`null`・`undefined` は書き出されない
- 時間と配置のルールは [組み込みの要素](Syntax.md)

## 部品

- example の部品（[`example/src/parts.tsx`](../../example/src/parts.tsx)）。白い背景に、右に解説役、赤い字幕、区切りのジングルを入れる解説動画の部品

```tsx
// example/src/parts.tsx（抜粋）
// 字幕: 赤い文字に白の縁、その外にもう一回り赤の縁
const Subtitle = ({ children }: Children) => (
  <>
    {(
      [
        ["#B80D14", 9],
        ["#FFFFFF", 6],
      ] as const
    ).map(([stroke, width]) => (
      <text x="50%" y="97%" anchor="b" max-w="74%" align="center" size={56} weight="bold" color={COLOR.red} stroke={stroke} stroke-width={width} z={100}>
        {children}
      </text>
    ))}
  </>
);
…
// 解説のセリフ。show はこのセリフの間だけ出す（強調の枠など）
export const Sasara = ({ children, face, show, ...time }: Line) => (
  <stack {...time}>
    <sasara.Talk face={face}>
      <Voicevox {...voice}>{children}</Voicevox>
    </sasara.Talk>
    <Subtitle>{children}</Subtitle>
    {show}
  </stack>
);

// 区切りのジングル: ピンクの画面に、傾けた大きな文字
export const Jingle = ({ children }: { children: string }) => (
  <stack>
    <rect w="100%" h="100%" fill={COLOR.pink} z={20} />
    <text x="33%" y="47%" anchor="c" size={190} weight="bold" color="#FFFFFF" stroke={COLOR.magenta} stroke-width={18} rotate={-9} z={21}>
      {children}
    </text>
    <audio src="assets/chime.wav" volume={0.5} />
    <big.Stand face="決め" />
    …
  </stack>
);
…
// 赤い枠で囲む
export const Mark = ({ x, y, w, h, at }: { x: Length; y: Length; w: Length; h: Length; at?: At }) => (
  <rect x={x} y={y} w={w} h={h} stroke={COLOR.red} stroke-width={7} radius={10} at={at} fadein={5} z={50} />
);
```

```tsx
// example/src/main.tsx（抜粋）
<Terminal at={INSTALL_TERM} w={1140}>
  …
</Terminal>
<seq>
  …
  <Sasara face="指差し" show={<TermMark term={INSTALL_TERM} from={7} to={8} w={400} />}>
    問題なければ、フォルダに移って、bun install です。
  </Sasara>
```

- 部品はただの関数（hooks や状態はない）。`async` にもできる
- `<Sasara>`: 読み上げ（[`<Voicevox>`](../voice/voice.md)）・立ち絵（[`sasara.Talk`](Portrait.md)）・字幕を同時に再生する。`show` に渡した枠やラベルは、そのセリフの間だけ出る
- 二重の縁取りは、同じ位置に `stroke-width` の違う `<text>` を重ねる
- `children`・配列・条件分岐は React と同じ（example の `<Terminal>` の `children.split("\n").map(…)` など）
- フラグメント `<>…</>` は、中身を親の子として展開する

### コードを表示する

```tsx
// example/src/parts.tsx（抜粋）
// コード: 白い紙に行番号。位置を決めて置き、<CodeMark> で行を囲む
export const Code = ({ at: { x, y, size }, w, children }: { at: CodeAt; w?: number; children: string }) => (
  <column x={x} y={y} w={w} fill="#FAFAFA" stroke="#C8C8C8" stroke-width={3} radius={8} padding={PAD}>
    <row gap={24}>
      <text pre font={MONO} size={size} line-height={LH} color="#A8A8A8" align="right">
        {children
          .split("\n")
          .map((_, i) => String(i + 1))
          .join("\n")}
      </text>
      <text pre font={MONO} size={size} line-height={LH} color={COLOR.ink}>
        {children}
      </text>
    </row>
  </column>
);
```

```tsx
// example/src/main.tsx（抜粋）
const IMPORTS: CodeAt = { x: 70, y: 740, size: 25 };
…
<Code at={IMPORTS}>{'import { Zunda, ZundaPortrait } from "./character/zunda";\nimport { Metan, MetanPortrait } from "./character/metan";'}</Code>
…
<Sasara face="笑顔" show={<CodeMark code={IMPORTS} from={1} to={2} w={1000} />}>
```

- `<text pre>` は改行と空白をそのまま表示する
- テンプレート文字列の共通のインデントと、前後の空行は除く
- 行の高さ（`size` × `line-height`）が決まっているので、`<CodeMark>` は何行目かから枠の位置を計算する

## プレビュー

```
$ bun preview          # http://localhost:3333
```

- 中身は `mekuru-server --run 'bun --hot src/main.tsx' .mekuru/main.xml`
- 起動するとブラウザを開く。開かないなら `bun preview --no-open`、いつも開かないなら環境変数 `MEKURU_OPEN=0`（そのときも `--open` で開く）
- VS Code の中で見る: ターミナルに出た `http://localhost:3333` を選ぶと、VS Code の Integrated Browser で開く。VS Code のターミナルでだけ自動で開かないようにするなら、`~/.bashrc` に `[ "$TERM_PROGRAM" = vscode ] && export MEKURU_OPEN=0` と書く
- 台本を保存するたびに XML を書き出し直し、プレビューとタイムラインを更新する
- 下の帯の真ん中のボタンで、再生・一時停止と、1 フレーム・1 秒の前後に動く
  - キーでは Space が再生・一時停止、←/→ が 1 フレーム、Shift+←/→ が 1 秒
  - 再生位置は下の帯の左に出る
- タイムラインの帯とクリップには、タグ（`<stack>`・`<repeat>`・`<video>` など）と、中のセリフ・ファイル名・文字を書く
- タイムラインをクリック・ドラッグすると、その時刻に移る。区間をクリックすると、その始まりに移る
- タイムラインの上の境目をドラッグすると、高さを変えられる（ブラウザが覚えておく）
- 下の帯の右のスライダー（または Ctrl+ホイール）で、タイムラインを拡大する。スライダーは再生位置を中心に拡大する
- 時間・配置・文字組みは、書き出しと同じコンパイラが決める
- SVG のアンチエイリアスや動画のシーク精度は、書き出しと違うことがある
- `<speed>` の部分は、ブラウザが速さを変えて再生する（音程は保つ）。ブラウザが変えられるのは 1/16〜16 倍まで。それより速い部分は、位置を飛ばしながら追いかける
- 台本のエラー（stderr）はブラウザに出る。プレビューは直前の内容のまま

## 書き出す

```
$ bun run build                     # video.mp4
$ bun run build --preview           # 半分の解像度・15fps
$ bun run build --from 60 --to 90   # 一部だけ
```

- 中身は `bun src/main.tsx && mekuru-compiler .mekuru/main.xml -o video.mp4`

## コマンド

- `mekuru-server <xml>`: ビューア
  - `--run <cmd>`: XML を書き出し続けるコマンド
  - `--port`（既定 3333）・`--title`
  - `--no-open`・`--open`: ブラウザを開くか（既定は開く。環境変数 `MEKURU_OPEN=0` なら開かない）
- `mekuru-compiler <xml>`: 動画を書き出す
  - `-o`: 出力ファイル
  - `--preview`: 半分の解像度・15fps
  - `--scale`・`--fps`・`--from`・`--to`
  - `--preset`・`--crf`: x264 の設定
  - `--no-audio`: 音声なし
- 共通の `--root`: プロジェクトのフォルダ（素材のパスの基準）。既定は XML のあるフォルダ（`.mekuru/` ならその上）
- どちらも `@mekuru/cli` パッケージのコマンド
