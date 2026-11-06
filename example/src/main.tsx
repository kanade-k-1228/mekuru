import { type FC, writeXml } from "@mekuru/tsx";
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
  Zundamon,
  ZundamonStand,
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
  <text text="はじめての動画" />
  <seq>
    <Zundamon text="こんにちは" />
    <Zundamon text="今日は…" />
  </seq>
</stack>`;

const TOOLS_TERM: CodeAt = { x: 70, y: 520, size: 38 };

const CREATE_TERM: CodeAt = { x: 70, y: 160, size: 34 };
const PICK: CodeAt = { x: 70, y: 300, size: 26 };
const OPTION_TERM: CodeAt = { x: 70, y: 600, size: 26 };

const INSTALL_TERM: CodeAt = { x: 70, y: 170, size: 32 };

const FILES: CodeAt = { x: 70, y: 160, size: 30 };
const ENTRIES: readonly Entry[] = [
  [0, "my-video/"],
  [1, "src/"],
  [2, "main.tsx", "台本"],
  [2, "parts.tsx", "字幕・読み方"],
  [2, "character/", "サンプルからコピー"],
  [3, "zundamon.tsx", "ずんだもん"],
  [1, "assets/", "画像・音声"],
  [1, "package.json"],
];
const IMPORTS: CodeAt = { x: 70, y: 740, size: 25 };

const SCRIPT: CodeAt = { x: 70, y: 140, size: 24 };

const PREVIEW_TERM: CodeAt = { x: 70, y: 160, size: 34 };
const VIEWER = { x: 70, y: 290, w: 900, h: 562 };

const BEFORE: CodeAt = { x: 70, y: 210, size: 30 };
const AFTER: CodeAt = { x: 70, y: 430, size: 30 };

const CHECK_TERM: CodeAt = { x: 70, y: 560, size: 38 };

const VOICE: CodeAt = { x: 70, y: 200, size: 28 };
const READ: CodeAt = { x: 70, y: 480, size: 28 };

const ADD: CodeAt = { x: 70, y: 160, size: 26 };
const FRAME = { x: 110, y: 470, w: 640, h: 360 };
const Figure: FC<{ at: number; color: string }> = ({ at, color }) => (
  <rect x={FRAME.x + FRAME.w * at} y={FRAME.y + FRAME.h} anchor="b" w={FRAME.h * 0.45 * 0.6} h={FRAME.h * 0.45} fill={color} radius={40} />
);

const SECOND: CodeAt = { x: 60, y: 150, size: 27 };
const Scene: FC<{ x: number; title: string }> = ({ x, title }) => (
  <column x={x} y={700} w={440} h={110} fill="#141C26" radius={10} justify="center" align="center">
    <text size={36} color="#FFFFFF" text={title} />
  </column>
);

const BUILD_TERM: CodeAt = { x: 70, y: 170, size: 32 };
const LIGHT_TERM: CodeAt = { x: 70, y: 470, size: 32 };

const YAML: CodeAt = { x: 70, y: 200, size: 28 };

const YOUTUBE_TERM: CodeAt = { x: 70, y: 210, size: 30 };
const NICO_TERM: CodeAt = { x: 70, y: 500, size: 30 };

const Tutorial: FC = () => (
  <mekuru size="1920x1080" fps={30} lang="ja">
    <rect w="100%" h="100%" fill="#FFFFFF" />
    <repeat fadein={30} fadeout={60}>
      <audio src="assets/bgm.mp3" volume={0.06} />
    </repeat>
    <stack>
      <ZundamonStand />
      <seq>
        <stack id="intro">
          <seq>
            <stack>
              <Shot x={70} y={110} src="assets/lesson.png" w={780} />
              <Shot x={560} y={420} src="assets/viewer.png" w={600} />
              <seq>
                <Zundamon face="smile" text="こんにちは。ぼくはずんだもんなのだ。" />
                <Zundamon text="今日は、Mekuru で解説動画を作る手順を紹介します。" />
                <Zundamon face="worry" text="解説動画って、セリフに合わせて絵を並べるだけなのに、編集ソフトだと意外と大変ですよね。" />
              </seq>
            </stack>
            <stack>
              <Keyword x={300} y={150} anchor="t" size={84} text="台本" />
              <Code at={{ x: 70, y: 290, size: 26 }} text={FLOW} />
              <line p="620:425,790:425,790:380,880:480,790:580,790:535,620:535" closed fill="#FFFFFF" stroke="#555555" stroke-width={4} />
              <text x={708} y={480} anchor="c" size={38} weight="bold" color={COLOR.ink} text="Mekuru" />
              <Keyword x={1065} y={150} anchor="t" size={84} text="動画" />
              <Shot x={900} y={385} src="assets/lesson.png" w={330} />
              <seq>
                <Zundamon face="smug" text="そこで Mekuru！ テキストで書いた台本から、そのまま動画を作れます。" />
                <Zundamon text="セリフは音声合成で読み上げて、動画の長さも、セリフに合わせて自動で決まります。">
                  <Label x={708} y={650} size={44} text="長さは自動！" />
                </Zundamon>
              </seq>
            </stack>
            <stack>
              <Shot x={70} y={70} src="assets/lesson.png" w={1120} />
              <seq>
                <Zundamon face="smile" text="今回は、ぼくが一人で話す、こんな動画を作ってみましょう。" />
                <Zundamon face="wink" text="コードを打ちながら見る人は、こまめに止めてね。" />
              </seq>
            </stack>
          </seq>
        </stack>
        <Jingle text="じゅんび" />
        <stack id="tools">
          <Step n="01" text="道具をそろえる" />
          <column x={80} y={170} gap={20}>
            <Point text="Bun 1.4 以上 — 台本を動かす" />
            <Point text="ffmpeg（libx264 付き）/ ffprobe — 書き出し" />
            <Point text="フォント — Noto Sans・Noto Sans CJK" />
            <Point text="irodoru — セリフの読み上げ" />
          </column>
          <Terminal at={TOOLS_TERM} w={760} text={"$ bun --version\n$ ffmpeg -version\n$ ffprobe -version"} />
          <seq>
            <Zundamon text="まずは道具をそろえます。" />
            <Zundamon text="Bun は 1.4 以上、ffmpeg は動画をエンコードできるものを用意します。" />
            <Zundamon text="フォントを入れて、irodoru を起動するのだ。" />
            <Zundamon text="声の説明を指定して、台本を読み上げるのだ。" />
            <Zundamon text="接続先の設定は、この手順を確認してね。irodoru は起動したまま使うのだ。">
              <Label x={640} y={820} size={34} color={COLOR.blue} text="pkgs/speech/README.jp.md" />
            </Zundamon>
            <Zundamon text="Windows の人は、WSL の中で動かしてね。">
              <Label x={1020} y={600} color={COLOR.blue} size={48} text="Windows → WSL" />
            </Zundamon>
            <Zundamon face="smile" text="ターミナルでこの三つを実行して、バージョンが出たら OK です！">
              <TermMark term={TOOLS_TERM} from={1} to={3} w={740} />
            </Zundamon>
          </seq>
        </stack>
        <stack id="create">
          <Step n="02" text="プロジェクトを作る" />
          <Terminal at={CREATE_TERM} w={1140} text={"$ bun create @mekuru my-video"} />
          <Terminal
            at={PICK}
            w={800}
            text={["◇ Project template", "│ ● irodoru sample", "│ ○ Empty project", "◇ Upload to (You can add it later)", "│   ◻ YouTube   ◻ niconico"].join(
              "\n",
            )}
          />
          <seq>
            <Zundamon text="次は、プロジェクトを作ります。" />
            <Zundamon text="テンプレートは irodoru sample を選びます。空の台本から始めることもできます。">
              <TermMark term={PICK} from={1} to={3} w={740} />
            </Zundamon>
            <Zundamon text="上下で移動して、エンターで決定です。投稿先はスペースでチェックできます。">
              <column x={910} y={330} gap={18}>
                <Label x={0} y={0} anchor="tl" color={COLOR.blue} size={44} text="↑↓ 移動" />
                <Label x={0} y={80} anchor="tl" color={COLOR.blue} size={44} text="Space 選ぶ" />
                <Label x={0} y={160} anchor="tl" color={COLOR.blue} size={44} text="Enter 決定" />
              </column>
            </Zundamon>
            <Zundamon face="wink" text="投稿先も選べるけど、動画を作るだけなら、選ばなくて大丈夫！">
              <TermMark term={PICK} from={4} to={5} w={740} />
            </Zundamon>
            <Zundamon text="同じ選択は、オプションでまとめて指定することもできます。">
              <Terminal at={OPTION_TERM} w={1140} text={"$ bun create @mekuru my-video \\\n    --template sample --upload youtube,niconico --yes"} />
            </Zundamon>
          </seq>
        </stack>
        <stack id="install">
          <Step n="03" text="パッケージを入れる" />
          <Terminal
            at={INSTALL_TERM}
            w={1140}
            text={[
              "Created a Mekuru Movie Maker project in my-video",
              "",
              "✓ ffmpeg: 8.1",
              "",
              "$ cd my-video",
              "$ bun install",
              "$ bun run irodoru",
              "# 別のターミナルで bun preview",
            ].join("\n")}
          />
          <seq>
            <Zundamon text="プロジェクトができると、ffmpeg のチェック結果が出ます。">
              <TermMark term={INSTALL_TERM} from={3} w={1110} />
            </Zundamon>
            <Zundamon text="問題なければ、フォルダに移って、bun install です。">
              <TermMark term={INSTALL_TERM} from={5} to={6} w={400} />
            </Zundamon>
            <Zundamon text="Docker を起動して、bun run irodoru を実行します。公開イメージの取得後、音声サーバーが起動します。">
              <TermMark term={INSTALL_TERM} from={7} to={8} w={1110} />
            </Zundamon>
            <Zundamon text="ここから先のコマンドは、全部このフォルダの中で実行します。">
              <Label x={640} y={760} size={50} text="ここから先は my-video の中で" />
            </Zundamon>
          </seq>
        </stack>
        <stack id="files">
          <Step n="04" text="ファイルを開く" />
          <Tree at={FILES} w={760} entries={ENTRIES} />
          <Code at={IMPORTS} text={'import { Zundamon, ZundamonPortrait } from "./character/zundamon";'} />
          <seq>
            <Zundamon text="エディタでプロジェクトを開きます。まず、サンプルの部品を追加しましょう。" />
            <Zundamon text="台本は src の main.tsx。動画の中身は、ここに書いていきます。">
              <TreeMark tree={FILES} from={3} w={500} />
            </Zundamon>
            <Zundamon text="先に example で bun run portrait を実行します。tutorial の character と parts.tsx を src に、assets をプロジェクト直下にコピーしてね。">
              <TreeMark tree={FILES} from={5} to={6} w={740} />
            </Zundamon>
            <Zundamon face="smile" text="ずんだもんの声と立ち絵の部品は、この import で読み込みます。">
              <CodeMark code={IMPORTS} from={1} w={1110} />
            </Zundamon>
          </seq>
        </stack>
        <Jingle text="だいほん！" />
        <stack id="first-script">
          <seq>
            <stack>
              <Step n="05" text="最初の台本を書く" />
              <Code at={SCRIPT} text={FIRST_SCRIPT.trimEnd()} />
              <seq>
                <Zundamon text="それでは、main.tsx をこのコードに置き換えて、保存してね。" />
                <Zundamon text="最初の rect が背景、text が見出しです。">
                  <CodeMark code={SCRIPT} from={6} w={760} />
                  <Label x={1110} y={350} anchor="l" text="背景" />
                  <CodeMark code={SCRIPT} from={8} to={9} w={870} />
                  <Label x={1110} y={437} anchor="l" text="見出し" />
                </Zundamon>
                <Zundamon text="続く二行が、ぼくのセリフです。字幕も自動で付きます。">
                  <CodeMark code={SCRIPT} from={11} to={12} w={895} />
                  <Label x={1110} y={541} anchor="l" text="セリフ" />
                </Zundamon>
              </seq>
            </stack>
            <stack>
              <Step text="stack と seq" />
              <rect x={110} y={250} w={1080} h={330} stroke="#9A9A9A" stroke-width={4} radius={14} />
              <Label x={130} y={250} anchor="l" size={48} text="stack" />
              <rect x={150} y={290} w={980} h={100} fill="#E9E9EC" stroke="#9A9A9A" stroke-width={3} radius={10} />
              <text x={640} y={340} anchor="c" size={44} weight="bold" color={COLOR.ink} text="見出し「はじめての動画」" />
              <rect x={136} y={420} w={1008} h={136} stroke={COLOR.orange} stroke-width={4} radius={12} />
              <Label x={156} y={420} anchor="l" size={44} text="seq" />
              <rect x={150} y={440} w={430} h={100} fill="#D4E5F5" stroke="#5C87B0" stroke-width={3} radius={10} />
              <text x={365} y={490} anchor="c" size={42} weight="bold" color="#2E5E8C" text="ずんだもん：あいさつ" />
              <rect x={590} y={440} w={540} h={100} fill="#D4E5F5" stroke="#5C87B0" stroke-width={3} radius={10} />
              <text x={860} y={490} anchor="c" size={42} weight="bold" color="#2E5E8C" text="ずんだもん：今日のテーマ" />
              <line p="150:650,1150:650" head="end" stroke="#555555" stroke-width={6} />
              <text x={1150} y={680} anchor="tr" size={36} color={COLOR.sub} text="時間" />
              <seq>
                <Zundamon text="stack は「同時に」重ねて、seq は「順番に」再生するまとまりです。">
                  <Label x={330} y={250} anchor="l" size={44} color={COLOR.blue} text="同時に" />
                  <Label x={290} y={420} anchor="l" size={44} color={COLOR.blue} text="順番に" />
                </Zundamon>
                <Zundamon text="見出しを出したまま、ぼくのセリフを上から順番に読み上げます。" />
                <Zundamon face="smug" text="秒数は書かなくて大丈夫。場面の長さは、セリフの長さで決まるんです！">
                  <Label x={640} y={760} size={52} text="場面の長さ ＝ セリフの長さ" />
                </Zundamon>
              </seq>
            </stack>
          </seq>
        </stack>
        <stack id="preview">
          <Step n="06" text="プレビューする" />
          <Terminal at={PREVIEW_TERM} w={560} text={"$ bun preview"} />
          <Shot x={VIEWER.x} y={VIEWER.y} src="assets/viewer.png" w={VIEWER.w} />
          <seq>
            <Zundamon text="保存したら、ターミナルで bun preview を実行します。">
              <TermMark term={PREVIEW_TERM} from={1} w={520} />
            </Zundamon>
            <Zundamon text="ブラウザでビューアが開きます。上が動画のプレビューで、">
              <Mark x={VIEWER.x} y={VIEWER.y} w={VIEWER.w} h={VIEWER.h * 0.56} />
              <Label x={1090} y={VIEWER.y + 150} text="プレビュー" />
            </Zundamon>
            <Zundamon text="下がタイムラインです。">
              <Mark x={VIEWER.x} y={VIEWER.y + VIEWER.h * 0.56} w={VIEWER.w} h={VIEWER.h * 0.17} />
              <Label x={1090} y={VIEWER.y + 370} text="タイムライン" />
            </Zundamon>
            <Zundamon text="スペースキーで再生して、セリフが順番に流れるか確かめてね。">
              <Label x={1090} y={VIEWER.y + 150} color={COLOR.blue} text="Space 再生" />
            </Zundamon>
            <Zundamon text="タイムラインの区間を押すと、そこへ移動できます。">
              <Mark x={VIEWER.x + 4} y={VIEWER.y + VIEWER.h * 0.6} w={VIEWER.w * 0.45} h={VIEWER.h * 0.04} />
            </Zundamon>
          </seq>
        </stack>
        <stack id="edit">
          <Step n="07" text="セリフを変えてみる" />
          <Code at={BEFORE} text={'<Zundamon text="こんにちは、ずんだもんなのだ。" />'} />
          <Arrow x1={400} y1={315} x2={400} y2={415} />
          <Code at={AFTER} text={'<Zundamon text="今日は、はじめての解説動画を作っています。" />'} />
          <column x={80} y={600} gap={20}>
            <Point text="保存すると、プレビューが更新される" />
            <Point text="合成が終わると、本当の長さになる" />
          </column>
          <seq>
            <Zundamon text="ビューアを開いたまま、エディタに戻って、最初のセリフを長くしてみます。" />
            <Zundamon face="smile" text="保存すると、プレビューが勝手に更新されます。" />
            <Zundamon text="新しいセリフは、まず見積もりの長さで出て、合成が終わると、ほんとの長さになります。" />
            <Zundamon face="wink" text="タイムラインが伸びたのを確かめたら、セリフを元に戻しておいてね。" />
          </seq>
        </stack>
        <stack id="errors">
          <Step n="08" text="更新されないときは" />
          <column x={80} y={170} gap={24}>
            <Point text="保存したのは src/main.tsx？" />
            <Point text="bun preview のターミナルは動いてる？" />
            <Point text="ブラウザにエラーが出ていない？" />
            <Point text="新しいセリフの合成には、音声エンジンが必要" />
          </column>
          <Terminal at={CHECK_TERM} w={700} text={"$ bun run typecheck"} />
          <seq>
            <Zundamon face="worry" text="もし更新されなかったら、ここをチェック！" />
            <Zundamon face="worry" text="保存したファイルは合ってる？ プレビューのターミナルは、動いてる？" />
            <Zundamon text="台本にエラーがあると、ビューアは前の画面のままで、上にエラーが出ます。" />
            <Zundamon text="タグや属性の書き間違いは、型チェックでも見つけられます。">
              <TermMark term={CHECK_TERM} from={1} w={660} />
            </Zundamon>
          </seq>
        </stack>
        <Jingle text="ちょうせい！" />
        <stack id="voice">
          <Step n="09" text="間と読み方を調整する" />
          <text x={76} y={152} size={30} color={COLOR.sub} text="src/character/zundamon.tsx" />
          <Code at={VOICE} text={"const line = await Speech.prepare({\n  gap: 12, caption: '明るく元気な声',\n  reading: READING, text,\n});"} />
          <text x={76} y={432} size={30} color={COLOR.sub} text="src/parts.tsx" />
          <Code at={READ} text={'export const READING = {\n  Mekuru: "めくる", bun: "バン", TSX: "ティーエスエックス",\n};'} />
          <seq>
            <Zundamon text="次はセリフの間です。Speech.prepare の gap を変えてみましょう。">
              <CodeMark code={VOICE} from={2} w={238} />
            </Zundamon>
            <Zundamon face="smile" text="30 fps の動画で 12 にすると、セリフの後に 0.4 秒の間が入ります。" />
            <Zundamon text="読み方を直したい言葉は、parts.tsx の READING に足してね。">
              <CodeMark code={READ} from={2} w={1000} />
            </Zundamon>
            <Zundamon text="字幕はそのままで、読み上げだけが、指定した読み方になります。" />
            <Zundamon text="接続先などの設定は、音声エンジンの日本語 README を見てね。">
              <Label x={640} y={760} size={34} color={COLOR.blue} text="pkgs/speech/README.jp.md" />
            </Zundamon>
          </seq>
        </stack>
        <stack id="portrait">
          <Step n="10" text="立ち絵を出す" />
          <Code at={ADD} text={`<rect w="100%" h="100%" fill="#141C26" />\n${PORTRAITS}\n<stack>\n  …\n</stack>`} />
          <rect x={FRAME.x} y={FRAME.y} w={FRAME.w} h={FRAME.h} fill="#141C26" />
          <Figure at={0.85} color="#9BC5EB" />
          <seq>
            <Zundamon text="立ち絵も出してみましょう。import に ZundamonPortrait を加えて、背景のすぐ後ろに、この一行を足します。">
              <CodeMark code={ADD} from={2} w={700} />
            </Zundamon>
            <Zundamon text="x で横の位置を、h で高さを、画面に対する割合で決めています。">
              <Label x={FRAME.x + FRAME.w * 0.85} y={FRAME.y + 150} size={40} text="x=85%" />
              <line
                p={`${FRAME.x + FRAME.w + 40}:${FRAME.y + FRAME.h},${FRAME.x + FRAME.w + 40}:${FRAME.y + FRAME.h * 0.55}`}
                head="both"
                stroke={COLOR.orange}
                stroke-width={8}
              />
              <Label x={FRAME.x + FRAME.w + 70} y={FRAME.y + FRAME.h * 0.78} anchor="l" size={40} text="h=45%" />
            </Zundamon>
            <Zundamon face="smile" text="保存して、画面の右側に立ち絵が一つ出たら成功です。" />
            <Zundamon face="wink" text="この立ち絵は、SD イラストをまとめたシンプルな PSD から展開しているのだ。" />
          </seq>
        </stack>
        <stack id="second-scene">
          <Step n="11" text="二つ目の場面を足す" />
          <Code at={SECOND} text={SECOND_SCENE} />
          <Scene x={70} title="はじめての動画" />
          <Arrow x1={530} y1={755} x2={640} y2={755} />
          <Scene x={660} title="動画を作る流れ" />
          <seq>
            <Zundamon text="最後に、二つ目の場面を足します。最初の stack を閉じた、すぐ後ろに書きます。" />
            <Zundamon text="column を使うと、見出しと説明を、縦に並べられます。">
              <CodeMark code={SECOND} from={2} to={5} w={1130} />
            </Zundamon>
            <Zundamon text="mekuru の直下に並べた場面は、順番に進みます。">
              <Label x={590} y={650} size={44} text="順番に進む" />
            </Zundamon>
            <Zundamon face="smile" text="最後まで再生して、次の見出しに切り替わったら OK！" />
          </seq>
        </stack>
        <stack id="review">
          <Step n="12" text="通して確認する" />
          <Shot x={70} y={170} src="assets/lesson.png" w={640} />
          <column x={760} y={190} gap={26}>
            <Point size={42} text="セリフの順番" />
            <Point size={42} text="字幕の読みやすさ" />
            <Point size={42} text="立ち絵と文字の重なり" />
            <Point size={42} text="二つ目の場面へ進む" />
          </column>
          <seq>
            <Zundamon text="ここまでできたら、最初から最後まで、通して見てみましょう。" />
            <Zundamon text="セリフの順番、字幕の読みやすさ、立ち絵と文字の重なりをチェックしてね。" />
            <Zundamon face="smile" text="気になるところは、台本を直して保存すれば、すぐ確認できます。" />
          </seq>
        </stack>
        <Jingle text="かきだし！" />
        <stack id="render">
          <Step n="13" text="動画に書き出す" />
          <Terminal at={BUILD_TERM} w={1150} text={"$ bun run build\nwrote video.mp4 (1920x1080, 345 frames, 00:11) in 4.2s"} />
          <Terminal at={LIGHT_TERM} w={1000} text={"$ bun run build --preview\n# 半分の解像度・15fps（同じ video.mp4 に書き出す）"} />
          <seq>
            <Zundamon face="wink" text="いよいよ書き出しです！ 別のターミナルで、bun run build を実行します。">
              <TermMark term={BUILD_TERM} from={1} w={500} />
            </Zundamon>
            <Zundamon text="終わると video.mp4 ができます。プレイヤーで開いて、画面と音を確認してね。">
              <TermMark term={BUILD_TERM} from={2} w={1110} />
            </Zundamon>
            <Zundamon text="軽く試したいときは、preview オプションで、半分の解像度で書き出せます。">
              <TermMark term={LIGHT_TERM} from={1} w={640} />
            </Zundamon>
            <Zundamon face="worry" text="同じファイルに上書きされるので、最後は、オプションなしで書き出し直してね。">
              <TermMark term={LIGHT_TERM} from={2} w={960} />
            </Zundamon>
          </seq>
        </stack>
        <stack id="upload-config">
          <Step n="14" text="投稿の設定（任意）" />
          <text x={76} y={152} size={30} color={COLOR.sub} text="configs/youtube.yaml" />
          <Code
            at={YAML}
            text={
              'video: video.mp4\ntitle: "はじめての Mekuru 動画"\ndescription: |\n  Mekuru Movie Maker で作った最初の動画です。\n  音声: irodoru / Irodori-TTS\ntags: [MekuruMovieMaker, irodoru, ずんだもん]\nprivacy: private'
            }
          />
          <seq>
            <Zundamon face="wink" text="投稿したい人は、もうひと手間！" />
            <Zundamon text="YouTube を選んだ人は、youtube.yaml に、タイトルと説明文を書きます。">
              <CodeMark code={YAML} from={2} to={4} w={760} />
            </Zundamon>
            <Zundamon text="説明文には、使った音声のクレジットも入れてね。">
              <CodeMark code={YAML} from={5} w={960} />
            </Zundamon>
            <Zundamon text="公開範囲は、まず非公開にしておくと安心です。">
              <CodeMark code={YAML} from={7} w={400} />
            </Zundamon>
          </seq>
        </stack>
        <stack id="upload">
          <Step n="15" text="投稿する（任意）" />
          <Label x={76} y={170} anchor="l" size={44} color={COLOR.blue} text="YouTube" />
          <Terminal at={YOUTUBE_TERM} w={1000} text={"$ bun run upload:youtube --dry-run\n$ bun run upload:youtube"} />
          <Label x={76} y={460} anchor="l" size={44} color={COLOR.blue} text="ニコニコ動画" />
          <Terminal at={NICO_TERM} w={1000} text={"$ bunx playwright-core install chromium\n$ bunx mekuru-niconico login\n$ bun run upload:niconico --check"} />
          <seq>
            <Zundamon text="初回だけは準備が必要です。日本語の手順は、docs の Upload.jp.md を見てね。">
              <Label x={640} y={790} size={34} color={COLOR.blue} text="docs/reference/Upload.jp.md" />
            </Zundamon>
            <Zundamon text="YouTube は、dry-run で中身を確かめてから、アップロードします。">
              <TermMark term={YOUTUBE_TERM} from={1} to={2} w={960} />
            </Zundamon>
            <Zundamon text="ニコニコ動画は、ブラウザでログインして、確認してから投稿します。">
              <TermMark term={NICO_TERM} from={2} to={3} w={960} />
            </Zundamon>
            <Zundamon text="投稿したら、投稿先で、動画と公開範囲を確認しましょう。" />
          </seq>
        </stack>
        <stack id="outro">
          <Shot x={70} y={70} src="assets/lesson.png" w={760} />
          <column x={80} y={540} gap={18}>
            <Point size={40} text="src/main.tsx にセリフと場面を書く" />
            <Point size={40} text="bun preview で、保存しながら確認" />
            <Point size={40} text="bun run build で video.mp4 に" />
          </column>
          <seq>
            <Zundamon face="smile" text="これで、一人語りの動画ができました。" />
            <Zundamon text="次は、セリフや見出しを、自分の内容に変えてみてね。" />
            <Zundamon text="今回のコードは、リポジトリの example にあります。">
              <Label x={420} y={790} size={36} color={COLOR.blue} text="github.com/kanade-k-1228/mekuru" />
            </Zundamon>
            <Zundamon face="wink" text="それでは、また次の動画で。" />
            <Exit />
          </seq>
        </stack>
      </seq>
    </stack>
    <EndCard top="動画づくり" bottom="完全に理解した" credit="音声: irodoru / Irodori-TTS　立ち絵: SDずんだもん（画像生成・自作PSD）" len={120} />
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Tutorial />);
