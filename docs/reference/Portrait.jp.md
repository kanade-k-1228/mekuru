# 立ち絵

[English](Portrait.md)

`@mekuru/narrator` はMekuru独自規約のPSDから立ち絵を準備し、表情切り替え・まばたき・音量による口パクを行います。動画生成時は展開済みPNGと `portrait.json` だけを読みます。

## PSDの作り方

最上位のレイヤー・グループを `名前 [種類]` と命名します。全体を別のグループで包まず、PSD上の重なり順をそのまま描画順にします。名前は自由で、目・口などの部位名に特別な意味はありません。

| 種類 | 内容 | 生成されるprops |
| --- | --- | --- |
| `[fixed]` | 固定の画像・グループ | なし |
| `[toggle]` | 表示を切り替える画像・グループ | boolean |
| `[select]` | 直下の子から1つを選ぶグループ | 選択肢名またはnull |
| `[blink]` | まばたきする表情を選ぶグループ | 選択肢名またはnull |
| `[lip]` | 口パクする表情を選ぶグループ | 選択肢名またはnull |

```text
キャラ.psd（上が手前）
├─ glasses [toggle]
├─ eyes [blink]
│  ├─ normal
│  │  ├─ 2（全開）
│  │  ├─ 1（半開）
│  │  └─ 0（閉じ）
│  └─ smile（静止画像）
├─ mouth [lip]
│  └─ normal
│     ├─ 1（開き）
│     └─ 0（閉じ）
├─ clothes [select]
│  ├─ casual
│  └─ formal
└─ body [fixed]
```

括弧内は説明です。フレームの実際の名前は `0`、`1`、`2` のように数字だけにします。

- `[select]` の選択肢は画像またはグループ。グループは内部の表示状態で合成します。選択肢が1つでも選択式のままです。
- `[blink]`・`[lip]` の選択肢は静止画像、またはフレームを持つグループです。フレームは `0` から欠番なしの整数名で、閉→開の順です。PSD上の並び順には依存しません。1フレームなら静止します。
- 各フレーム自体をグループにして、線画や塗りを内側に置けます。そこから先の階層には規約上の意味はありません。
- 初期値はPSD保存時の表示状態です。選択式で表示中の子が複数あるとエラーです。親が非表示、または表示中の子がなければ初期値はnullです。
- `[toggle]` も保存時の表示状態を初期値にします。falseで非表示、選択式はnullで非表示にできます。呼び出しごとに初期値から解決します。
- 名前はそのままprops・ファイル名になります。props名は日本語を含むJavaScript識別子にしてください。`id`・`at`・`len`・`children`・`source`・`key`・`ref`・`__proto__`・`constructor`・`prototype` は予約名です。同じ階層のパーツ名・選択肢名は大文字小文字違いも重複と扱います。パス区切りやWindows予約ファイル名は使えません。

8-bit RGBのラスターレイヤー、通常合成、不透明度、基本的なラスターマスクに対応します。通過グループは不透明度100%・マスクなしに限ります。調整レイヤー、クリッピング、レイヤー効果、ベクターマスクなどは該当箇所を示してエラーにします。必要な描画をパーツ・差分の内側でラスタライズ・統合してください。

## 素材を展開する

```sh
bun x mekuru-psd assets/source/character.psd --out assets/character
```

PNGは元のキャンバス寸法と座標を維持します。

- 固定・オンオフ: `body.png`
- 静止選択肢: `clothes/casual.png`
- アニメーション: `eyes/normal/0.png`、`eyes/normal/1.png` など
- `portrait.json`: 奥→手前のパーツ、種類、初期値、選択肢ごとの閉→開の画像配列
- `portrait.d.ts`: `LayerProps` 型

表示に必要な画像だけを生成します。線画などの内部レイヤーは個別PNGとして保存しません。編集用原稿はPSDに残してください。出力先は素材専用のフォルダーとし、再出力時には以前のマニフェストに記録された不要な画像だけを削除します。無関係なファイルは保持します。

## 台本で使う

```tsx
import { Audio, readAudio, type FC } from "@mekuru/tsx";
import { portrait } from "@mekuru/narrator";
import type { LayerProps } from "./assets/character/portrait";

const actor = portrait<LayerProps>({ src: "assets/character", x: "80%" });
const Line: FC = async () => {
  const source = await readAudio("assets/voice/line.wav");
  return <stack>
    <actor.Stand />
    <Audio source={source} />
    <actor.Talk source={source} eyes="normal" mouth="normal" />
  </stack>;
};
```

`Line` を `<mekuru>` 内で使います。音声合成では `readAudio` の代わりに `Speech.prepare(...)` などの `line.audio` を渡します。`Talk` 自体は音声を再生しません。

`Stand` は待機表示で、`id`・`at`・`len` を受け取ります。`Talk` は `source` の長さだけ表示します。同じ `slot` の待機表示は発言中だけ差し替わります。口は待機・下書き・無音・余韻では閉じます。目は下書きでもまばたきします。動きは同じ入力で再現可能です。

配置は `x`・`y`・`anchor`・`w`・`h`・`z`・`rotate`。既定は画面下中央、高さ80%です。`slot` の既定は `portrait:<src>` で、同じ素材を別の位置に置く場合は別のslotを指定します。`blink` はまばたきの平均間隔（整数フレーム）、既定は4秒分です。falseまたは0で停止します。

複数パーツの表情プリセットは、利用側で `{ eyes: "smile", mouth: "normal" }` のようなオブジェクトやTSX部品として定義します。

## 既存のYMM4向けPSDなどから変換する

```sh
bun x mekuru-psd source.psd --inspect
bun x mekuru-psd source.psd --map mapping.json --out character.psd
bun x mekuru-psd character.psd --out assets/character
```

`--map` を付けると、`--out` は素材フォルダーではなく変換後のPSDを指します。`--inspect` はレイヤーパスの配列、各レイヤー自身の表示状態、グループかどうか、合成モード、不透明度をJSONで出力します。順序は奥→手前です。表示状態は親の非表示を含む実効値ではありません。

次の設定では `!目` の配下の画像を明示的に指定します。`!` や `*` は元の名前の一部として一致させるだけで、互換規約として解釈しません。

```json
{
  "layers": [
    { "name": "body", "kind": "fixed", "initial": true, "source": ["体"] },
    {
      "name": "eyes", "kind": "blink", "initial": "normal",
      "options": [
        { "name": "normal", "frames": [["!目", "*閉じ"], ["!目", "*半開"], ["!目", "*開き"]] }
      ]
    }
  ]
}
```

- `layers` は奥→手前。`fixed`・`toggle` は `source` とbooleanの `initial` を指定します。
- `select`・`blink`・`lip` は `options` と選択肢名またはnullの `initial` を指定します。`select` の `frames` は1つ、アニメーションは閉→開の順に1つ以上指定します。
- `source` と各フレームは、ルートからのレイヤー名配列です。参照先自身は非表示でも取り込めます。参照先がグループなら、その内部の表示レイヤーを合成します。
- 存在しないパス、同名で曖昧なパスはエラーです。参照先より上の親に不透明度変更、有効なマスク、特殊合成がある場合もエラーです。親の効果を含めて統合した差分を用意してください。
- 元PSDは変更しません。変換先にはパーツ・差分ごとに合成した画像レイヤーを配置します。細かい線画の修正は元PSDで行い、同じ設定で再変換します。再実行は変換先を更新します。
- 描画機能の対応範囲は上記のPSD取り込みと同じです。YMM4の設定ファイルの読み取り、部位名の推定、PSDTool独自機能の再現は行いません。
