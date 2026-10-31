import { writeXml } from "@mekuru/core";
import {
  Arrow,
  COLOR,
  Code,
  CodeMark,
  EndCard,
  Exit,
  Jingle,
  Keyword,
  Label,
  Mark,
  Point,
  Sasara,
  SasaraStand,
  Shot,
  Step,
  Terminal,
  TermMark,
  Tree,
  TreeMark,
  type CodeAt,
  type Entry,
} from "./parts";
import { FIRST_SCRIPT, PORTRAITS, SECOND_SCENE } from "./lesson";

const FLOW = `<stack>
  <text>はじめての動画</text>
  <seq>
    <Zunda>こんにちは</Zunda>
    <Metan>今日は…</Metan>
  </seq>
</stack>`;

const intro = () => (
  <stack id="intro">
    <seq>
      <stack>
        <Shot x={70} y={110} src="assets/lesson.png" w={780} />
        <Shot x={560} y={420} src="assets/viewer.png" w={600} />
        <seq>
          <Sasara face="笑顔">はーい！</Sasara>
          <Sasara face="決め">ささらちゃんだよー！</Sasara>
          <Sasara face="指差し">動画、作ってますか〜？</Sasara>
          <Sasara face="困り">解説動画って、セリフに合わせて絵を並べるだけなのに、編集ソフトだと意外と大変ですよね。</Sasara>
        </seq>
      </stack>
      <stack>
        <Keyword x={300} y={150} anchor="t" size={84}>
          台本
        </Keyword>
        <Code at={{ x: 70, y: 290, size: 26 }}>{FLOW}</Code>
        <line p="620:425,790:425,790:380,880:480,790:580,790:535,620:535" closed fill="#FFFFFF" stroke="#555555" stroke-width={4} />
        <text x={708} y={480} anchor="c" size={38} weight="bold" color={COLOR.ink}>
          Mekuru
        </text>
        <Keyword x={1065} y={150} anchor="t" size={84}>
          動画
        </Keyword>
        <Shot x={900} y={385} src="assets/lesson.png" w={330} />
        <seq>
          <Sasara face="ドヤ">そこで Mekuru！ TSX で書いた台本から、そのまま動画を作れます。</Sasara>
          <Sasara
            face="指差し"
            show={
              <Label x={708} y={650} size={44}>
                長さは自動！
              </Label>
            }
          >
            セリフは音声合成で読み上げて、動画の長さも、セリフに合わせて自動で決まります。
          </Sasara>
        </seq>
      </stack>
      <stack>
        <Shot x={70} y={70} src="assets/lesson.png" w={1120} />
        <seq>
          <Sasara face="笑顔">今回は、ずんだもんと四国めたんが話す、こんな動画を作ってみましょう！</Sasara>
          <Sasara face="ウインク">コードを打ちながら見る人は、こまめに止めてね。</Sasara>
        </seq>
      </stack>
    </seq>
  </stack>
);

const TOOLS_TERM: CodeAt = { x: 70, y: 520, size: 38 };

const tools = () => (
  <stack id="tools">
    <Step n="01">道具をそろえる</Step>
    <column x={80} y={170} gap={20}>
      <Point>Bun — 台本を動かす</Point>
      <Point>ffmpeg / ffprobe — 動画の書き出し</Point>
      <Point>日本語フォント — Rounded Mplus 1c など</Point>
      <Point>VOICEVOX — 読み上げ</Point>
    </column>
    <Terminal at={TOOLS_TERM} w={760}>
      {"$ bun --version\n$ ffmpeg -version\n$ ffprobe -version"}
    </Terminal>
    <seq>
      <Sasara>まずは道具をそろえます。</Sasara>
      <Sasara face="指差し">必要なのは、Bun、ffmpeg、日本語のフォント、それから VOICEVOX です。</Sasara>
      <Sasara
        show={
          <Label x={1020} y={600} color={COLOR.blue} size={48}>
            Windows → WSL
          </Label>
        }
      >
        Windows の人は、WSL の中で動かしてね。
      </Sasara>
      <Sasara face="笑顔" show={<TermMark term={TOOLS_TERM} from={1} to={3} w={740} />}>
        ターミナルでこの三つを実行して、バージョンが出たら OK です！
      </Sasara>
    </seq>
  </stack>
);

const CREATE_TERM: CodeAt = { x: 70, y: 160, size: 34 };
const PICK: CodeAt = { x: 70, y: 300, size: 26 };
const OPTION_TERM: CodeAt = { x: 70, y: 600, size: 26 };

const create = () => (
  <stack id="create">
    <Step n="02">プロジェクトを作る</Step>
    <Terminal at={CREATE_TERM} w={1140}>
      {"$ bun create mekuru-app my-video"}
    </Terminal>
    <Terminal at={PICK} w={800}>
      {[
        "◆ Characters (You can add characters later)",
        "│ ▾ VOICEVOX (2)",
        "│   ◼ ずんだもん",
        "│   ◼ 四国めたん",
        "│   ◻ 春日部つむぎ",
        "│ ▸ COEIROINK",
        "◇ Upload to (You can add it later)",
        "│   ◻ YouTube   ◻ niconico",
      ].join("\n")}
    </Terminal>
    <seq>
      <Sasara>次は、プロジェクトを作ります。</Sasara>
      <Sasara face="指差し" show={<TermMark term={PICK} from={3} to={4} w={400} />}>
        選ぶ画面になったら、VOICEVOX を開いて、ずんだもんと四国めたんを選びます。
      </Sasara>
      <Sasara
        show={
          <column x={910} y={330} gap={18}>
            <Label x={0} y={0} anchor="tl" color={COLOR.blue} size={44}>
              ↑↓ 移動
            </Label>
            <Label x={0} y={80} anchor="tl" color={COLOR.blue} size={44}>
              Space 選ぶ
            </Label>
            <Label x={0} y={160} anchor="tl" color={COLOR.blue} size={44}>
              Enter 決定
            </Label>
          </column>
        }
      >
        矢印キーで移動、スペースで選んで、エンターで決定です。
      </Sasara>
      <Sasara face="ウインク" show={<TermMark term={PICK} from={7} to={8} w={740} />}>
        投稿先も選べるけど、動画を作るだけなら、選ばなくて大丈夫！
      </Sasara>
      <Sasara
        show={
          <Terminal at={OPTION_TERM} w={1140}>
            {"$ bun create mekuru-app my-video \\\n    --voice zunda,metan --upload youtube,niconico --yes"}
          </Terminal>
        }
      >
        同じ選択は、オプションでまとめて指定することもできます。
      </Sasara>
    </seq>
  </stack>
);

const INSTALL_TERM: CodeAt = { x: 70, y: 170, size: 32 };

const install = () => (
  <stack id="install">
    <Step n="03">パッケージを入れる</Step>
    <Terminal at={INSTALL_TERM} w={1140}>
      {[
        "Created a Mekuru Movie Maker project in my-video",
        "",
        "Tools:",
        "  ✓ ffmpeg: 7.0.2-static",
        "  ✓ VOICEVOX: 0.26.0 at http://127.0.0.1:50021",
        "",
        "$ cd my-video",
        "$ bun install",
      ].join("\n")}
    </Terminal>
    <seq>
      <Sasara show={<TermMark term={INSTALL_TERM} from={3} to={5} w={1110} />}>プロジェクトができると、道具がそろっているかのチェック結果が出ます。</Sasara>
      <Sasara face="困り" show={<TermMark term={INSTALL_TERM} from={5} w={1110} />}>
        VOICEVOX につながらないって出たら、アプリが起動しているか確かめてね。
      </Sasara>
      <Sasara face="指差し" show={<TermMark term={INSTALL_TERM} from={7} to={8} w={400} />}>
        問題なければ、フォルダに移って、bun install です。
      </Sasara>
      <Sasara
        show={
          <Label x={640} y={760} size={50}>
            ここから先は my-video の中で
          </Label>
        }
      >
        ここから先のコマンドは、全部このフォルダの中で実行します。
      </Sasara>
    </seq>
  </stack>
);

const FILES: CodeAt = { x: 70, y: 160, size: 30 };
const ENTRIES: readonly Entry[] = [
  [0, "my-video/"],
  [1, "src/"],
  [2, "main.tsx", "台本"],
  [2, "parts.tsx", "字幕・読み方"],
  [2, "character/"],
  [3, "zunda.tsx", "ずんだもん"],
  [3, "metan.tsx", "四国めたん"],
  [1, "assets/", "画像・音声"],
  [1, "package.json"],
];
const IMPORTS: CodeAt = { x: 70, y: 740, size: 25 };

const files = () => (
  <stack id="files">
    <Step n="04">ファイルを開く</Step>
    <Tree at={FILES} w={760} entries={ENTRIES} />
    <Code at={IMPORTS}>{'import { Zunda, ZundaPortrait } from "./character/zunda";\nimport { Metan, MetanPortrait } from "./character/metan";'}</Code>
    <seq>
      <Sasara>エディタでプロジェクトを開くと、こんなファイルができています。</Sasara>
      <Sasara face="指差し" show={<TreeMark tree={FILES} from={3} w={500} />}>
        台本は src の main.tsx。動画の中身は、ここに書いていきます。
      </Sasara>
      <Sasara show={<TreeMark tree={FILES} from={5} to={7} w={600} />}>選んだキャラクターの声と立ち絵は、character フォルダに一人ずつ入っています。</Sasara>
      <Sasara face="笑顔" show={<CodeMark code={IMPORTS} from={1} to={2} w={1000} />}>
        main.tsx の先頭には、そのキャラクターを読み込む import が、もう書いてあります。
      </Sasara>
    </seq>
  </stack>
);

const SCRIPT: CodeAt = { x: 70, y: 140, size: 24 };

const firstScript = () => (
  <stack id="first-script">
    <seq>
      <stack>
        <Step n="05">最初の会話を書く</Step>
        <Code at={SCRIPT}>{FIRST_SCRIPT.trimEnd()}</Code>
        <seq>
          <Sasara>それでは、main.tsx をこのコードに置き換えて、保存してね。</Sasara>
          <Sasara
            face="指差し"
            show={
              <>
                <CodeMark code={SCRIPT} from={7} w={760} />
                <Label x={1110} y={384} anchor="l">
                  背景
                </Label>
                <CodeMark code={SCRIPT} from={9} to={11} w={870} />
                <Label x={1110} y={489} anchor="l">
                  見出し
                </Label>
              </>
            }
          >
            最初の rect が背景、text が見出しです。
          </Sasara>
          <Sasara
            show={
              <>
                <CodeMark code={SCRIPT} from={13} to={14} w={700} />
                <Label x={1110} y={610} anchor="l">
                  セリフ
                </Label>
              </>
            }
          >
            そして、二人のセリフ。字幕も自動で付きます。
          </Sasara>
        </seq>
      </stack>
      <stack>
        <Step>stack と seq</Step>
        <rect x={110} y={250} w={1080} h={330} stroke="#9A9A9A" stroke-width={4} radius={14} />
        <Label x={130} y={250} anchor="l" size={48}>
          stack
        </Label>
        <rect x={150} y={290} w={980} h={100} fill="#E9E9EC" stroke="#9A9A9A" stroke-width={3} radius={10} />
        <text x={640} y={340} anchor="c" size={44} weight="bold" color={COLOR.ink}>
          見出し「はじめての動画」
        </text>
        <rect x={136} y={420} w={1008} h={136} stroke={COLOR.orange} stroke-width={4} radius={12} />
        <Label x={156} y={420} anchor="l" size={44}>
          seq
        </Label>
        <rect x={150} y={440} w={430} h={100} fill="#CDEBC5" stroke="#6FAE62" stroke-width={3} radius={10} />
        <text x={365} y={490} anchor="c" size={42} weight="bold" color="#2E6B30">
          ずんだもん
        </text>
        <rect x={590} y={440} w={540} h={100} fill="#F7D0DF" stroke="#C9608A" stroke-width={3} radius={10} />
        <text x={860} y={490} anchor="c" size={42} weight="bold" color="#8E2457">
          四国めたん
        </text>
        <line p="150:650,1150:650" head="end" stroke="#555555" stroke-width={6} />
        <text x={1150} y={680} anchor="tr" size={36} color={COLOR.sub}>
          時間
        </text>
        <seq>
          <Sasara
            show={
              <>
                <Label x={330} y={250} anchor="l" size={44} color={COLOR.blue}>
                  同時に
                </Label>
                <Label x={290} y={420} anchor="l" size={44} color={COLOR.blue}>
                  順番に
                </Label>
              </>
            }
          >
            stack は「同時に」重ねて、seq は「順番に」再生するまとまりです。
          </Sasara>
          <Sasara face="指差し">だから、見出しを出したまま、ずんだもん、めたんの順に話します。</Sasara>
          <Sasara
            face="ドヤ"
            show={
              <Label x={640} y={760} size={52}>
                場面の長さ ＝ セリフの長さ
              </Label>
            }
          >
            秒数は書かなくて大丈夫。場面の長さは、セリフの長さで決まるんです！
          </Sasara>
        </seq>
      </stack>
    </seq>
  </stack>
);

const PREVIEW_TERM: CodeAt = { x: 70, y: 160, size: 34 };
const VIEWER = { x: 70, y: 290, w: 900, h: 562 };

const preview = () => (
  <stack id="preview">
    <Step n="06">プレビューする</Step>
    <Terminal at={PREVIEW_TERM} w={560}>
      {"$ bun preview"}
    </Terminal>
    <Shot x={VIEWER.x} y={VIEWER.y} src="assets/viewer.png" w={VIEWER.w} />
    <seq>
      <Sasara show={<TermMark term={PREVIEW_TERM} from={1} w={520} />}>保存したら、ターミナルで bun preview を実行します。</Sasara>
      <Sasara
        face="指差し"
        show={
          <>
            <Mark x={VIEWER.x} y={VIEWER.y} w={VIEWER.w} h={VIEWER.h * 0.56} />
            <Label x={1090} y={VIEWER.y + 150}>
              プレビュー
            </Label>
          </>
        }
      >
        ブラウザでビューアが開きます。上が動画のプレビューで、
      </Sasara>
      <Sasara
        face="指差し"
        show={
          <>
            <Mark x={VIEWER.x} y={VIEWER.y + VIEWER.h * 0.56} w={VIEWER.w} h={VIEWER.h * 0.17} />
            <Label x={1090} y={VIEWER.y + 370}>
              タイムライン
            </Label>
          </>
        }
      >
        下がタイムラインです。
      </Sasara>
      <Sasara
        show={
          <Label x={1090} y={VIEWER.y + 150} color={COLOR.blue}>
            Space 再生
          </Label>
        }
      >
        スペースキーで再生して、二人が順番に話すか確かめてね。
      </Sasara>
      <Sasara show={<Mark x={VIEWER.x + 4} y={VIEWER.y + VIEWER.h * 0.6} w={VIEWER.w * 0.45} h={VIEWER.h * 0.04} />}>
        タイムラインの区間を押すと、そこへ移動できます。
      </Sasara>
    </seq>
  </stack>
);

const BEFORE: CodeAt = { x: 70, y: 210, size: 30 };
const AFTER: CodeAt = { x: 70, y: 430, size: 30 };

const edit = () => (
  <stack id="edit">
    <Step n="07">セリフを変えてみる</Step>
    <Code at={BEFORE}>{"<Zunda>こんにちは、ずんだもんなのだ。</Zunda>"}</Code>
    <Arrow x1={400} y1={315} x2={400} y2={415} />
    <Code at={AFTER}>{"<Zunda>今日は、はじめての解説動画を作っているのだ。</Zunda>"}</Code>
    <column x={80} y={600} gap={20}>
      <Point>保存すると、プレビューが更新される</Point>
      <Point>合成が終わると、本当の長さになる</Point>
    </column>
    <seq>
      <Sasara>ビューアを開いたまま、エディタに戻って、ずんだもんのセリフを長くしてみます。</Sasara>
      <Sasara face="笑顔">保存すると、プレビューが勝手に更新されます。</Sasara>
      <Sasara>新しいセリフは、まず見積もりの長さで出て、合成が終わると、ほんとの長さになります。</Sasara>
      <Sasara face="ウインク">タイムラインが伸びたのを確かめたら、セリフを元に戻しておいてね。</Sasara>
    </seq>
  </stack>
);

const CHECK_TERM: CodeAt = { x: 70, y: 560, size: 38 };

const errors = () => (
  <stack id="errors">
    <Step n="08">更新されないときは</Step>
    <column x={80} y={170} gap={24}>
      <Point>保存したのは src/main.tsx？</Point>
      <Point>bun preview のターミナルは動いてる？</Point>
      <Point>ブラウザにエラーが出ていない？</Point>
      <Point>新しいセリフの合成には、音声エンジンが必要</Point>
    </column>
    <Terminal at={CHECK_TERM} w={700}>
      {"$ bun run typecheck"}
    </Terminal>
    <seq>
      <Sasara face="困り">もし更新されなかったら、ここをチェック！</Sasara>
      <Sasara face="はてな">保存したファイルは合ってる？ プレビューのターミナルは、動いてる？</Sasara>
      <Sasara>台本にエラーがあると、ビューアは前の画面のままで、上にエラーが出ます。</Sasara>
      <Sasara face="指差し" show={<TermMark term={CHECK_TERM} from={1} w={660} />}>
        タグや属性の書き間違いは、型チェックでも見つけられます。
      </Sasara>
    </seq>
  </stack>
);

const VOICE: CodeAt = { x: 70, y: 200, size: 28 };
const READ: CodeAt = { x: 70, y: 480, size: 28 };

const voice = () => (
  <stack id="voice">
    <Step n="09">声と読み方を調整する</Step>
    <text x={76} y={152} size={30} color={COLOR.sub}>
      src/character/zunda.tsx
    </text>
    <Code at={VOICE}>{'<Voicevox name="zunda" speaker={3}\n  speed={1.1} gap={8} reading={READING}>\n  {children}\n</Voicevox>'}</Code>
    <text x={76} y={432} size={30} color={COLOR.sub}>
      src/parts.tsx
    </text>
    <Code at={READ}>{'export const READING = {\n  Mekuru: "めくる", bun: "バン", TSX: "ティーエスエックス",\n};'}</Code>
    <seq>
      <Sasara show={<CodeMark code={VOICE} from={2} w={290} />}>次は声の調整です。キャラクターのファイルで、Voicevox に speed を足します。</Sasara>
      <Sasara face="笑顔">1.1 にすると、ずんだもんが、ちょっと早口になります。</Sasara>
      <Sasara face="指差し" show={<CodeMark code={READ} from={2} w={1000} />}>
        読み方を直したい言葉は、parts.tsx の READING に足してね。
      </Sasara>
      <Sasara>字幕はそのままで、読み上げだけが、指定した読み方になります。</Sasara>
    </seq>
  </stack>
);

const ADD: CodeAt = { x: 70, y: 160, size: 26 };
const FRAME = { x: 110, y: 470, w: 640, h: 360 };
const Figure = ({ at, color }: { at: number; color: string }) => (
  <rect x={FRAME.x + FRAME.w * at} y={FRAME.y + FRAME.h} anchor="b" w={FRAME.h * 0.45 * 0.6} h={FRAME.h * 0.45} fill={color} radius={40} />
);

const portraitStep = () => (
  <stack id="portrait">
    <Step n="10">立ち絵を出す</Step>
    <Code at={ADD}>{`<rect w="100%" h="100%" fill="#141C26" />\n${PORTRAITS}\n<stack>\n  …\n</stack>`}</Code>
    <rect x={FRAME.x} y={FRAME.y} w={FRAME.w} h={FRAME.h} fill="#141C26" />
    <Figure at={0.1} color="#F7B9D2" />
    <Figure at={0.9} color="#A8DC8F" />
    <seq>
      <Sasara show={<CodeMark code={ADD} from={2} to={3} w={600} />}>立ち絵も出してみましょう。背景のすぐ後ろに、この二行を足します。</Sasara>
      <Sasara
        face="指差し"
        show={
          <>
            <Label x={FRAME.x + FRAME.w * 0.1} y={FRAME.y + 150} size={40}>
              x=10%
            </Label>
            <Label x={FRAME.x + FRAME.w * 0.9} y={FRAME.y + 150} size={40}>
              x=90%
            </Label>
            <line
              p={`${FRAME.x + FRAME.w + 40}:${FRAME.y + FRAME.h},${FRAME.x + FRAME.w + 40}:${FRAME.y + FRAME.h * 0.55}`}
              head="both"
              stroke={COLOR.orange}
              stroke-width={8}
            />
            <Label x={FRAME.x + FRAME.w + 70} y={FRAME.y + FRAME.h * 0.78} anchor="l" size={40}>
              h=45%
            </Label>
          </>
        }
      >
        x で横の位置を、h で高さを、画面に対する割合で決めています。
      </Sasara>
      <Sasara face="笑顔">保存して、二人が左右に出たら成功です！</Sasara>
      <Sasara face="ウインク">最初に入る立ち絵はダミーなので、あとで好きな素材に差し替えてね。</Sasara>
    </seq>
  </stack>
);

const SECOND: CodeAt = { x: 60, y: 150, size: 27 };
const Scene = ({ x, title }: { x: number; title: string }) => (
  <column x={x} y={700} w={440} h={110} fill="#141C26" radius={10} justify="center" align="center">
    <text size={36} color="#FFFFFF">
      {title}
    </text>
  </column>
);

const secondScene = () => (
  <stack id="second-scene">
    <Step n="11">二つ目の場面を足す</Step>
    <Code at={SECOND}>{SECOND_SCENE}</Code>
    <Scene x={70} title="はじめての動画" />
    <Arrow x1={530} y1={755} x2={640} y2={755} />
    <Scene x={660} title="動画を作る流れ" />
    <seq>
      <Sasara>最後に、二つ目の場面を足します。最初の stack を閉じた、すぐ後ろに書きます。</Sasara>
      <Sasara face="指差し" show={<CodeMark code={SECOND} from={2} to={5} w={1130} />}>
        column を使うと、見出しと説明を、縦に並べられます。
      </Sasara>
      <Sasara
        show={
          <Label x={590} y={650} size={44}>
            順番に進む
          </Label>
        }
      >
        mekuru の直下に並べた場面は、順番に進みます。
      </Sasara>
      <Sasara face="笑顔">最後まで再生して、次の見出しに切り替わったら OK！</Sasara>
    </seq>
  </stack>
);

const review = () => (
  <stack id="review">
    <Step n="12">通して確認する</Step>
    <Shot x={70} y={170} src="assets/lesson.png" w={640} />
    <column x={760} y={190} gap={26}>
      <Point size={42}>セリフの順番</Point>
      <Point size={42}>字幕の読みやすさ</Point>
      <Point size={42}>立ち絵と文字の重なり</Point>
      <Point size={42}>二つ目の場面へ進む</Point>
    </column>
    <seq>
      <Sasara>ここまでできたら、最初から最後まで、通して見てみましょう。</Sasara>
      <Sasara face="指差し">セリフの順番、字幕の読みやすさ、立ち絵と文字の重なりをチェックしてね。</Sasara>
      <Sasara face="笑顔">気になるところは、台本を直して保存すれば、すぐ確認できます。</Sasara>
    </seq>
  </stack>
);

const BUILD_TERM: CodeAt = { x: 70, y: 170, size: 32 };
const LIGHT_TERM: CodeAt = { x: 70, y: 470, size: 32 };

const render = () => (
  <stack id="render">
    <Step n="13">動画に書き出す</Step>
    <Terminal at={BUILD_TERM} w={1150}>
      {"$ bun run build\nwrote video.mp4 (1920x1080, 345 frames, 00:11) in 4.2s"}
    </Terminal>
    <Terminal at={LIGHT_TERM} w={1000}>
      {"$ bun run build --preview\n# 半分の解像度・15fps（同じ video.mp4 に書き出す）"}
    </Terminal>
    <seq>
      <Sasara face="決め" show={<TermMark term={BUILD_TERM} from={1} w={500} />}>
        いよいよ書き出しです！ 別のターミナルで、bun run build を実行します。
      </Sasara>
      <Sasara show={<TermMark term={BUILD_TERM} from={2} w={1110} />}>終わると video.mp4 ができます。プレイヤーで開いて、画面と音を確認してね。</Sasara>
      <Sasara show={<TermMark term={LIGHT_TERM} from={1} w={640} />}>軽く試したいときは、preview オプションで、半分の解像度で書き出せます。</Sasara>
      <Sasara face="困り" show={<TermMark term={LIGHT_TERM} from={2} w={960} />}>
        同じファイルに上書きされるので、最後は、オプションなしで書き出し直してね。
      </Sasara>
    </seq>
  </stack>
);

const YAML: CodeAt = { x: 70, y: 200, size: 28 };

const uploadConfig = () => (
  <stack id="upload-config">
    <Step n="14">投稿の設定（任意）</Step>
    <text x={76} y={152} size={30} color={COLOR.sub}>
      configs/youtube.yaml
    </text>
    <Code at={YAML}>
      {
        'video: video.mp4\ntitle: "はじめての Mekuru 動画"\ndescription: |\n  Mekuru Movie Maker で作った最初の動画です。\n  音声: VOICEVOX:ずんだもん / VOICEVOX:四国めたん\ntags: [MekuruMovieMaker, VOICEVOX]\nprivacy: private'
      }
    </Code>
    <seq>
      <Sasara face="ウインク">投稿したい人は、もうひと手間！</Sasara>
      <Sasara show={<CodeMark code={YAML} from={2} to={4} w={760} />}>YouTube を選んだ人は、youtube.yaml に、タイトルと説明文を書きます。</Sasara>
      <Sasara face="指差し" show={<CodeMark code={YAML} from={5} w={960} />}>
        説明文には、使った音声のクレジットも入れてね。
      </Sasara>
      <Sasara show={<CodeMark code={YAML} from={7} w={400} />}>公開範囲は、まず非公開にしておくと安心です。</Sasara>
    </seq>
  </stack>
);

const YOUTUBE_TERM: CodeAt = { x: 70, y: 210, size: 30 };
const NICO_TERM: CodeAt = { x: 70, y: 500, size: 30 };

const upload = () => (
  <stack id="upload">
    <Step n="15">投稿する（任意）</Step>
    <Label x={76} y={170} anchor="l" size={44} color={COLOR.blue}>
      YouTube
    </Label>
    <Terminal at={YOUTUBE_TERM} w={1000}>
      {"$ bun run upload:youtube --dry-run\n$ bun run upload:youtube"}
    </Terminal>
    <Label x={76} y={460} anchor="l" size={44} color={COLOR.blue}>
      ニコニコ動画
    </Label>
    <Terminal at={NICO_TERM} w={1000}>
      {"$ bunx playwright-core install chromium\n$ bunx mekuru-niconico login\n$ bun run upload:niconico --check"}
    </Terminal>
    <seq>
      <Sasara>初回だけは準備が必要です。手順は、docs の Upload.md を見てね。</Sasara>
      <Sasara show={<TermMark term={YOUTUBE_TERM} from={1} to={2} w={960} />}>YouTube は、dry-run で中身を確かめてから、アップロードします。</Sasara>
      <Sasara show={<TermMark term={NICO_TERM} from={2} to={3} w={960} />}>ニコニコ動画は、ブラウザでログインして、確認してから投稿します。</Sasara>
      <Sasara face="指差し">投稿したら、投稿先で、動画と公開範囲を確認しましょう。</Sasara>
    </seq>
  </stack>
);

const outro = () => (
  <stack id="outro">
    <Shot x={70} y={70} src="assets/lesson.png" w={760} />
    <column x={80} y={540} gap={18}>
      <Point size={40}>src/main.tsx に会話と場面を書く</Point>
      <Point size={40}>bun preview で、保存しながら確認</Point>
      <Point size={40}>bun run build で video.mp4 に</Point>
    </column>
    <seq>
      <Sasara face="笑顔">てなわけで、最初の動画ができました！</Sasara>
      <Sasara face="指差し">次は、セリフや見出しを、自分の内容に変えてみてね。</Sasara>
      <Sasara
        show={
          <Label x={420} y={790} size={36} color={COLOR.blue}>
            github.com/kanade-k-1228/mekuru
          </Label>
        }
      >
        今回のコードと手順は、example の README にまとめてあります。
      </Sasara>
      <Sasara face="決め">んじゃ、またねー！</Sasara>
      <Exit />
    </seq>
  </stack>
);

const Tutorial = () => (
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
        {tools()}
        {create()}
        {install()}
        {files()}
        <Jingle>だいほん！</Jingle>
        {firstScript()}
        {preview()}
        {edit()}
        {errors()}
        <Jingle>ちょうせい！</Jingle>
        {voice()}
        {portraitStep()}
        {secondScene()}
        {review()}
        <Jingle>かきだし！</Jingle>
        {render()}
        {uploadConfig()}
        {upload()}
        {outro()}
      </seq>
    </stack>
    <EndCard top="動画づくり" bottom="完全に理解した" credit="音声: VOICEVOX:冥鳴ひまり　立ち絵: しりんだーふれいる 様" len={120} />
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Tutorial />);
