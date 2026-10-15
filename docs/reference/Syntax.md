# 組み込みの要素

- 18 種類のタグで動画を表す。[TSX の台本](Component.md) に小文字の要素として書く
- `writeXml` が部品を展開し、組み込みの要素だけの XML（[中間形式](#xml中間形式)）にする
- 素材の相対パスは、プロジェクトのフォルダが基準（[コマンド](Component.md#コマンド)）
- 基本例は [チュートリアルの完成形](../../example/tutorial/main.tsx) と [解説動画の台本](../../example/src/main.tsx) から引く。応用例では example の素材・部品を使う
  - 大文字の要素は部品。`<Zunda>`・`<Metan>` は新規プロジェクトで選んだキャラクター、`<Sasara>`・`<Step>` などは example の部品（解説役の読み上げと字幕、左上の見出しなど）

| 種類       | タグ                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| 全体       | `<mekuru>`                                                                                           |
| 入れ物     | `<seq>`・`<row>`・`<column>`・`<stack>`                                                              |
| 時間       | `<dur>`（長さを決める）・`<repeat>`（繰り返す）。空間では何もしない                                  |
| 表示       | `<text>`（中で `<br/>`）・`<image>`・`<video>`・`<rect>`・`<circle>`・`<line>`                       |
| 音         | `<audio>`                                                                                            |
| 素材の再生 | `<hold>`（一時停止）・`<speed>`（倍速・スロー）・`<cut>`（カット）。どれも `<video>`・`<audio>` の中 |

## 規則

- 入れ物は、子を 1 つの軸に並べ、ほかの軸では重ねる

| 入れ物     | 時間           | 横     | 縦     |
| ---------- | -------------- | ------ | ------ |
| `<seq>`    | 並べる         | 重ねる | 重ねる |
| `<row>`    | 重ねる         | 並べる | 重ねる |
| `<column>` | 重ねる         | 重ねる | 並べる |
| `<stack>`  | 重ねる         | 重ねる | 重ねる |

- 並べる: 長さ・大きさを足し合わせる。重ねる: いちばん長い・大きいものに合わせる
- [`<dur>`](#dur)・[`<repeat>`](#repeat) は時間だけを変える。空間では何もせず、中のものは親の子として並ぶ
- 要素は、長さのあるものとないものに分かれる（[長さ](#長さ)）。長さのないものは、親の終わりまで続く。大きさを書かないものは、重ねる向きに親いっぱいに伸びる
- どの要素にも、時間の属性（`at`・`fadein` など）と見た目の属性（`x`・`w`・`opacity`・`z` など）を付けられる
- 時間は、すべて整数のフレーム数で書く（`fps={30}` なら 30 で 1 秒）
- 位置は動画全体で一度だけ決める。`<seq>` の大きさは、中身がすべて収まる大きさ

```tsx
// example/src/main.tsx（抜粋）
<mekuru size="1920x1080" fps={30} font="Rounded Mplus 1c">
  <rect w="100%" h="100%" fill="#FFFFFF" />
  <repeat fadein={30} fadeout={60}>
    <audio src="assets/bgm.mp3" volume={0.06} />
  </repeat>
  <stack>
    <SasaraStand />
    <seq>
      {intro()}
      <Jingle>ささらぼ！</Jingle>
      …
    </seq>
  </stack>
  …
</mekuru>
```

## `<mekuru>`

- 動画全体を囲む。画面の大きさの `<seq>`（XML では、中身を 1 つの `<seq>` に入れて書き出す）
- `size`: 画面の大きさ（`"1920x1080"`）
- `fps`: フレームレート。時間はすべて、このフレームの数で書く（既定 30）
- `font`: フォント名か、フォントファイルのパス
- 背景は、画面全体の `<rect>` を最初に置いて描く。何もない所は黒

## 時間

### 長さ

- 要素は、長さのあるものとないものに分かれる。どちらになるかは、タグと中身で決まる
- 長さのないものは、親の終わりまで続く。親の長さにも、`<seq>` の並びにも効かない

| 要素                                                | 長さ                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `<video>`・`<audio>`                                | ある。素材の長さ（中の `<hold>`・`<speed>`・`<cut>` も効く）                             |
| `<text>`・`<image>`・`<rect>`・`<circle>`・`<line>` | ない                                                                                     |
| `<seq>`・`<stack>`・`<row>`・`<column>`             | 長さのある子があればある（`<seq>` は足し合わせ、ほかは最後に終わる子まで）。なければない |
| `<repeat>`                                          | ない。中に長さのあるものが要る                                                           |
| `<dur len={90}>`                                    | ある。90 フレーム。中のものの長さも 90 フレームにする                                    |

- 長さを変えるのは 2 つだけ: [`<dur>`](#dur) は長さのないものに長さを与え、[`<repeat>`](#repeat) は長さのあるものを繰り返して、長さのないものにする
- 文字や図形だけの場面は `<dur>` で包む。何もない `<dur len={9} />` は間になる

```tsx
// example/tutorial/main.tsx（抜粋）
<stack>
  <text x="50%" y="35%" anchor="center" size={90}>
    はじめての動画
  </text>
  <seq>
    <Zunda>こんにちは、ずんだもんなのだ。</Zunda>
    <Metan>今日は Mekuru で動画を作るわ。</Metan>
  </seq>
</stack>
```

- `<seq>` が２つのセリフを順に読む
- 見出しは長さがないので、`<seq>` が終わるまで表示される

### 時刻の決まり方

- すべての要素の始まり `s` と終わり `e` は、次の式で決まる。長さのないものは `e` を持たない

```
s(X) = max( p(X) + a,  T(Y, q) )     at={a} か at="Y:q"。書かない a は 0、書かない T の項はない
p(X) = s(親)                         親が <seq> 以外か、X が最初の子
     = max( p(前), e(前) )           親が <seq>（前は直前の兄弟。前に長さがなければ p(前)）
e(X) = s(X) + d                      <dur len={d}> と、その直下の子
     = T(X, to)                      動画・音声（to の位置の <hold> も待つ）
     = max( s(X), e(C) … )           入れ物と <hold>（C は長さのある子）
T(Y, q) = s(Y) + q                   動画・音声以外
        = max( s(Y) + ⌈u(from, q)⌉,  e(H) + ⌈u(q_H, q)⌉ … )
                                     動画・音声（H は位置 q_H < q の <hold>）
u(a, b) = ∫ dq / r(q)  （a から b）   素材の a から b を再生するフレーム数（r は速さ）
s(H) = T(M, q_H)                     <hold at={q_H}>（M はそれを持つ動画・音声）
表示の終わり E(X) = min( e(X), E(親) )   長さがなければ E(親)。<hold> の親は、それを持つ動画・音声
表示される区間 = [ s(X), E(X) )
```

- 時刻・長さ・位置は、すべて整数（フレーム）。実数になるのは `u` だけで、`⌈ ⌉` で切り上げる
  - `s`・`e` は整数なので、`⌈max(a, b)⌉ = max(⌈a⌉, ⌈b⌉)`・`⌈n + x⌉ = n + ⌈x⌉` から、`T(Y, q)` は「素材が `q` に着く最初のフレーム」になる
  - 素材の長さ（秒）は `fps` を掛けてフレームにする。`to` を省くと、素材はその長さで終わる。切り上げるので、音声の終わりは切れない
- `T(Y, q)`: `Y` の時計が `q` に着く時刻。動画・音声の時計は素材の時刻で、[`<hold>`](#hold) で止まった分だけ遅れる。それ以外は始まりからのフレーム数
- `r(q)`: 素材の `q` を再生する速さ。ふつうは 1、[`<speed>`](#speedcut) の中は `rate`（重なれば掛け合わせる）、[`<cut>`](#speedcut) の中は ∞（時間を使わない）。速さを変えなければ `u(a, b) = b − a` で、整数のまま
- 動画・音声の時計は、素材と `<hold>` を交互に並べた `<seq>` と同じ（`from` から `q₁` まで再生 → `<hold>` → `q₂` まで再生 → …）。再生する部分の長さが `u`
- 整数の上の `max` と `+` しか使わないので、時刻は依存関係をたどった最長路で決まる。どこかを遅らせて、ほかが早まることはない。輪になると決まらない（エラー E510）

### 時間の属性

- `id="intro"`: 参照用の名前（文書内で一意）
- `at`: 始まる時
  - `at={60}`: 並びの位置から 60 フレーム後（`<seq>` の中では直前の長さを持つ子の終わりから、ほかでは親の始まりから）
  - `at="intro"`: `intro` と同時（`at="intro:0"` と同じ）。`<seq>` の中では、直前の子の終わりと `intro` の始まりの遅いほう
  - `at="clip:150"`: `clip` の時計が 150 フレームになった時（例は [`<hold>`](#hold)）
    - 動画・音声は素材内の時刻。`from` から `to` の範囲で指す。[`<cut>`](#speedcut) で飛ばした位置は、飛ばす時を指す
    - `<repeat>` は始まりからのフレーム数。周ごとに戻らない
- エラー E504: 指定位置に達する前に対象が終わる、対象が表示されない、素材の範囲の外を指した
- エラー E510: `at` が輪になって、互いを待つ
- 警告 W550: すでに過ぎた時刻を参照した（並びの位置ですぐに始まる）

```tsx
// example の素材・部品を使った応用例
<rect at="rect" x={600} y={250} w={320} h={220} stroke={COLOR.red} stroke-width={8} radius={12} fadein={0.3} />
…
<seq>
  <Sasara>x と y を付けたタグは、その位置に置かれます。</Sasara>
  <Sasara id="rect" face="指差し">これが四角形です。</Sasara>
```

- 四角形は、セリフ `id="rect"` が始まる時に出る

### `<dur>`

- `len` フレームの長さを決める。中のもの（直下の子）の長さも `len` フレームにする
  - 長さのないもの（文字・画像・図形など）は、`len` フレームだけ表示する
  - 長さのあるものは、長ければ切り、短ければ延ばす。動画は最後のコマを表示し、音声は無音になる
  - 子がいくつあっても、どれも `len` フレームになって重なる
- 空間では何もしない。中のものは `<dur>` の親の子として並ぶ（`<row>` の中で包んでも、並びや `grow` は変わらない）
- 何も入れなければ間になる（`<dur len={9} />`）。`<hold>` の中に置けば、そのフレーム数だけ止める
- エラー E302: `len` がない

```tsx
// example/src/parts.tsx（抜粋）: ジングル
<seq>
  <dur len={9} />
  <big.Talk face="決め">
    <Voicevox {...voice}>{children}</Voicevox>
  </big.Talk>
  <dur len={21} />
</seq>
```

- セリフの前に 9 フレーム（0.3 秒）、後に 21 フレーム（0.7 秒）の間を置く

### `<repeat>`

- 時間では中身を `<stack>` と同じく重ね、最後に終わるものまでを 1 周として、親の終わりまで繰り返す
- 長さはない。`<dur>` で包むと、そのフレーム数だけ繰り返す（長さのあるものになる）
- 空間では何もしない（`<dur>` と同じ）
- 動画・音声を入れると素材を、`<seq>` を入れると並びを繰り返す。`<hold>`・`<speed>`・`<cut>` を入れた素材も、毎周同じに再生する
- `fadein`・`fadeout` は、`<repeat>` に付けると全体に、中のものに付けると毎周かかる
- 入れ子にしてもよい。音声も毎回鳴る
- エラー E321
  - 中に長さのあるものがない
  - 中では名前を使えない（`id`・`slot`・`at="id"`）。どの周も同じになる。`<repeat>` 自体には付けられる

```xml
<!-- example が書き出す .mekuru/main.xml から（抜粋）: 解説役のまばたき -->
<repeat>
  <seq>
    <dur len="123"><image src="assets/character/sasara/目/基本.png" …/></dur>
    <dur len="1"><image src="assets/character/sasara/目/基本.1.png" …/></dur>
    <dur len="2"><image src="assets/character/sasara/目/基本.0.png" …/></dur>
    <dur len="1"><image src="assets/character/sasara/目/基本.1.png" …/></dur>
    …
  </seq>
</repeat>
```

- 立ち絵（[@mekuru/portrait](Portrait.md)）が書き出すもの。開いた目・半分の目・閉じた目を繰り返す

### `slot`

- どの要素にも付けられる名前
- 同じ `slot` の要素が重なると、後から始まったもの（同時なら後に書いたもの）だけを描く
- 音声は隠れない

```xml
<!-- example の立ち絵が書き出す XML の構造例 -->
<stack slot="portrait:assets/character/sasara">  <!-- <SasaraStand />: 長さがないので最後まで立つ -->
  <image src="assets/character/sasara/体/基本.png" …/>
  …
</stack>
…
<stack>
  <dur len="24"><audio src=".mekuru/cache/tts/b5/b592ff….wav" label="sasara: はーい！"/></dur>
  <stack slot="portrait:assets/character/sasara">  <!-- このセリフの間だけ差し替わる: 笑顔で口パク -->
    …
  </stack>
</stack>
```

### `<hold>`

- `<video>`・`<audio>` の中に置く。素材は `at` フレームの位置で、`<hold>` の中身が終わるまで止まる
- 止まっている間、動画は同じコマを表示し、音声は無音
- 止まった分だけ、その先の素材の時計と終わりが遅れる（`<dur>` で長さを決めた素材は、その時間で終わる）
- 長さは入れ物と同じで、中で最後に終わるものまで。長さが要るので、中に長さのあるものを入れる。決まったフレーム数だけ止めるなら `<hold at={150}><dur len={60} /></hold>`
- 中身は、素材の親の上に `<stack>` と同じく重ねて置く。位置（字幕など）も見た目（`z`・`opacity`・フェード）も、素材ではなく親が基準
- 同じ位置の `<hold>` は同時に始まり、素材はいちばん長いものが終わるまで止まる
- 素材が親に切られれば、`<hold>` の中身も一緒に切れる
- `at="clip:150"` は、150 フレームの位置の `<hold>` が始まる時を指す
- エラー E320: 長さがない（中に長さのあるものがない）
- エラー E504: 素材の `from` から `to` の範囲の外を指した
- エラー E510: 中身が、素材がこの `<hold>` より先に進むのを待つ

```tsx
// example の素材・部品を使った応用例
<stack>
  <Step>動画と時刻</Step>
  <video id="life" src="assets/life.mp4" x={640} y={500} w={1100} anchor="center">
    <hold at={285}>
      <Label x={640} y={200}>一時停止中</Label>
      <Sasara face="驚き">hold を使うと、説明している間、動画が止まります。</Sasara>
    </hold>
  </video>
  <seq>
    <Sasara>動画も置けます。これはライフゲームの動画です。</Sasara>
    <Sasara at="life:135">at を付けると、動画の時刻に合わせてセリフを始められます。</Sasara>
    <Sasara at="life:300">説明が終わると、続きから再生されます。</Sasara>
  </seq>
</stack>
```

- 2 つ目のセリフは、動画が 135 フレーム（4.5 秒）の位置に来た時に始まる
- 動画は 285 フレームの位置で、`<hold>` の中のセリフが終わるまで止まる。そのあと続きから再生され、300 フレームの位置で 3 つ目のセリフが始まる

### `<speed>`・`<cut>`

- `<video>`・`<audio>` の中に置く。素材の `from` から `to` まで（フレーム）を、`<speed>` は `rate` 倍の速さで再生し、`<cut>` は飛ばす
- `rate`: 速さ。`2` で倍速、`0.5` でスロー。音声は音程を保つ
- `from`・`to` は素材の時刻。省くと、素材を使う範囲（`<video>`・`<audio>` の `from`・`to`）の始まり・終わり。`<speed rate={2} />` は全体を倍速にする
- 重なった部分は、速さを掛け合わせる。`<cut>` は速さ ∞ と同じで、重なった部分も飛ばす
- 素材の長さ（`<dur>` で決めない場合）と、`at="clip:q"`・`<hold at>` が指す時は、変えた速さで決まる（[式](#時刻の決まり方) の `u`）。整数のフレームにならなければ切り上げる
- `<cut>` の中の位置は、飛ばす時を指す。そこに置いた `<hold>` は、カットの後のコマ（続きから再生するコマ）で止まる
- エラー E303: `rate` が 0 以下
- エラー E314: `to` が `from` 以下
- エラー E504: 素材を使う範囲と重ならない

```tsx
// example の素材を使った応用例
<video id="life" src="assets/life.mp4">
  <speed from={60} to={180} rate={2} />
  <cut from={240} to={300} />
</video>
```

- 60〜180 フレームを 60 フレームで再生し、240〜300 フレームを飛ばす。420 フレーム（14 秒）の素材が 300 フレームになる
- `at="life:330"` は、動画の始まりから 210 フレーム後（60 + 60 + 60 + 30）

### フェード・不透明度・重なり

- `fadein`・`fadeout`: フェードのフレーム数。入れ物に付けると、中のすべて（音声も）にかかる。親子で掛け合わせる
- `opacity`: 不透明度（`0`〜`1` か `"50%"`）。親子で掛け合わせる
- `z`: 重なり順。大きいほど手前。省くと親の値。同じなら後に書いたものが手前

```tsx
// example/src/parts.tsx（抜粋）
// 解説役が消える: 背景と同じ白の幕を、立ち絵の上にだんだん重ねる
export const Exit = () => (
  <dur len={36}>
    <rect x={1150} w={770} h="100%" fill="#FFFFFF" fadein={24} z={15} />
  </dur>
);
```

## 空間

### 入れ物の属性

- `gap`: 子の間隔（`<row>`・`<column>`）
- `justify`: 並ぶ方向の揃え（`<row>`・`<column>`）
- `wrap="true"`: 折り返す（`<row>`・`<column>`）
- `align`: 重ねる方向の揃え。既定は `stretch`（親いっぱいに伸ばす）。`<stack>`・`<seq>` では縦横の両方
- `padding`: 内側の余白（1・2・4 個の値）
- `fill`・`stroke`・`stroke-width`・`radius`: 背景と枠
- 子の `grow="true"`: 余った空間を使う。空きを埋めるだけなら `<stack grow/>`
- 位置は先に決まるので、後から出る子があっても他は動かない

```tsx
// example の素材・部品を使った応用例
const Block = ({ size = 80 }: { size?: number }) => <rect w={size} h={size} fill="#7FD1AE" radius={10} />;

const Layout = ({ name, what, children }: { name: string; what: string; children: Node }) => (
  <column w={0} grow fill="#20304A" radius={16} padding={[48, 0]} align="center" gap={20}>
    <text size={64} color="#7FD1AE">
      {name}
    </text>
    <text size={40} color="#C8D3DE">
      {what}
    </text>
    <column grow w="100%" justify="center" align="center">
      {children}
    </column>
  </column>
);
…
<row h={600} gap={40}>
  <Layout name="row" what="横に並べる">
    <row gap={16}>
      <Block />
      <Block />
      <Block />
    </row>
  </Layout>
  …
  <Layout name="stack" what="重ねる">
    <stack align="center">
      <Block size={176} />
      <circle w={112} h={112} fill="#E8A33D" />
    </stack>
  </Layout>
  <Layout name="seq" what="順番に出す">
    <seq>
      <dur len={30}>
        <Block size={176} />
      </dur>
      <dur len={30}>
        <circle w={112} h={112} fill="#E8A33D" />
      </dur>
    </seq>
  </Layout>
</row>
```

### 表示する要素

- `<text>`: 文字
  - 文字は必ず `<text>` の中に書く（`<`・`&` は `&lt;`・`&amp;`）
  - `<br/>` で改行する
  - `w`・`max-w` で折り返す。`align="center"` で中央揃え
  - `color`: 文字の色。`stroke`・`stroke-width`: 文字の縁取り。`background`・`radius`・`padding`: 文字の背景
  - `pre="true"`: ソースの改行をそのまま表示する
- `<image src>`: 画像。`w`・`h` の片方だけなら縦横比を保つ。両方なら中に収める
- `<rect>`: 四角形
- `<circle>`: 円（`w`・`h` が違えば楕円）
- `<line p>`: 点を結ぶ線（`p="0:0,100:50,50%:100%"`。`x:y` を px か `%` で、`,` で区切る）
  - `closed="true"`: 最後の点と最初の点を結ぶ（多角形）
  - `fill` で内側を塗る。`closed` に `fill` だけを付けると枠線なし
  - `head`: 矢じり（`start`・`end`・`both`）
  - `dashed`・`dotted`: 破線・点線
- 図形は `fill` も `stroke` もなければ白い線で描く

```tsx
// example の素材・部品を使った応用例
<rect at="rect" x={1080} y={250} w={320} h={220} stroke="#7FD1AE" stroke-width={8} radius={12} fadein={0.3} />
<circle at="circle" x={1700} y={360} w={220} h={220} anchor="center" stroke="#E8A33D" stroke-width={8} fadein={0.3} />
<line at="line" p="1400:360,1590:360" dashed stroke="#C8D3DE" stroke-width={6} fadein={0.3} />
<line at="polygon" p="1500:700,1570:560,1640:700" closed fill="#E8A33D" fadein={0.3} />
<line at="polygon" p="1680:690,1730:590,1780:660,1830:570" stroke="#7FD1AE" stroke-width={8} fadein={0.3} />
<stack at="arrow" fadein={0.3}>
  <line p="1240:620,1240:490" head="end" stroke="#FFFFFF" stroke-width={8} />
  <text x={1240} y={640} anchor="t" align="center" size={56}>
    ここが
    <br />
    四角形
  </text>
</stack>
```

### 位置と大きさの属性

- `x`・`y`: 親の `padding` の内側の左上からの位置。付けると自動の並びから外れる
- `anchor`: `x`・`y` に合わせる点（`tl` 左上・`c` 中央・`b` 下中央）
- `w`・`h`: 幅・高さ。`min-w`・`max-w`・`min-h`・`max-h`: 最小・最大
- `rotate`: 回す角度（度。正の値で時計回り）。要素の中心で回し、中身も一緒に回る。並びには影響しない
  - `<line>` は、回した入れ物の中に置く
  - エラー E322: `<video>`（と、それを含む入れ物）は回せない
- 値の書き方
  - 長さ: px（`{100}`）か `%`（親の内側に対して）
  - 時間: フレーム数（0 以上の整数。`{45}` は `fps={30}` なら 1.5 秒）
  - 色: `#7FD1AE` や `white`
  - 真偽値: `closed` と書けば `true`

```tsx
// example/src/parts.tsx（抜粋）: ジングルの傾いた文字
<text x="30%" y="47%" anchor="c" size={180} weight="bold" color="#FFFFFF" stroke={COLOR.magenta} stroke-width={18} rotate={-9} z={21}>
  {children}
</text>
```

## `<video>`・`<audio>`

- `src`（必須）
- `from`・`to`: 素材の使う範囲（フレーム）
- `volume`: 音量（`0.5` か `"50%"`。`0` で消す）
- 繰り返すには [`<repeat>`](#repeat) に入れる
- [`<dur>`](#dur) で延ばすと、動画は最後のコマを表示し、音声は無音になる
- 途中で止めるには、中に [`<hold>`](#hold) を置く。一部を速く・遅く再生したり飛ばしたりするには、[`<speed>`・`<cut>`](#speedcut) を置く
- `label`: タイムラインに出す説明（`<audio>`）
- `<video>` の大きさは `<image>` と同じ: 素材の縦横比で、`w`・`h` を省くと素材の大きさ（入りきらなければ縮める）
- `<audio>` は場所を取らない（`<row>` の中でも並ばない）
- 読み上げの音声も `<audio>` になる（[声の設定](../voice/voice.md)）

```tsx
// example の素材・部品を使った応用例
<repeat fadein={30} fadeout={60}>
  <audio src="assets/bgm.mp3" volume={0.06} />
</repeat>
…
<seq>
  <Sasara>audio タグで、音も入れられます。</Sasara>
  <Sasara>repeat で囲むと、動画の最後まで繰り返し流れます。今流れている音楽がそうです。</Sasara>
  <audio src="assets/chime.wav" />
  <Sasara face="笑顔">
    今のが効果音です。
    <br />
    seq の中に置いた音は、前のセリフが終わってから鳴ります。
  </Sasara>
</seq>
```

- BGM は `<repeat>` で動画の最後まで繰り返す（長さがない）。フェードは `<repeat>` に付けて全体にかける
- 効果音は長さを持つので、`<seq>` の中では前のセリフが終わってから鳴り、次のセリフを待たせる

## XML（中間形式）

- `writeXml` が書き出し、`mekuru-compiler` が読む（`.mekuru/main.xml`）。人が書くことは想定しない
- TSX で省いたものを補い、値の書き方を 1 通りにする。ほかの書き方はエラーになる（黙って直さない）
- 属性名は TSX と同じ（`stroke-width` など）

|                             | TSX                                           | XML                                                              |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| 全体                        | `<mekuru>` の中を順に                         | `<mekuru>` の中に `<seq>` が 1 つ                                |
| 始まり                      | `at={60}`・`at="intro"`・`at="clip:150"`      | `delay="60"`・`at="intro:0"`・`at="clip:150"`（両方あれば遅いほう） |
| 時間（フレーム）            | `{45}`                                        | `45`                                                             |
| 割合（`opacity`・`volume`） | `{0.5}`・`"50%"`                              | `0.5`                                                            |
| 色                          | `white`・`#7FD1AE`                            | `#FFFFFF`・`#7FD1AE`（16 進だけ）                                |
| 真偽値                      | `closed`                                      | `closed="true"`（`false` は書かない）                            |
| `anchor`                    | `center`・`top`・`bottom`・`left`・`right` も | `tl`・`t`・`tr`・`l`・`c`・`r`・`bl`・`b`・`br`                  |
| `grow`                      | `grow`・数値                                  | 数値                                                             |
| `padding`                   | `{[0, 80]}`                                   | `"0 80"`                                                         |
| 下書きの音声                | 読み上げの部品が出す                          | `<dur len="…"><audio draft="true" label="…"/></dur>`。長さのない `<audio>` を見積もりの長さで包む。プレビューだけが読む |

```xml
<!-- example が書き出す .mekuru/main.xml から（抜粋） -->
<mekuru size="1920x1080" fps="30" font="Rounded Mplus 1c">
  <seq>
    <rect w="100%" h="100%" fill="#FFFFFF"/>
    <repeat fadein="30" fadeout="60">
      <audio src="assets/bgm.mp3" volume="0.06"/>
    </repeat>
    <stack>
      …
    </stack>
  </seq>
</mekuru>
```
