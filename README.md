# Mekuru Movie Maker

Responsive Time-Slicing Video Generator

- TSX の台本から、ゆっくり解説のような動画を作る
- セリフは音声合成で読み上げ、動画の尺はセリフの長さで決まる
- 撮った動画も台本の中で編集できる: カット・倍速・スロー・一時停止（[組み込みの要素](docs/reference/Syntax.md#speedcut)）、素材の時刻に合わせた字幕
- [`example/`](example/)

```
$ bun create mekuru-app
$ cd my-video
$ bun install
$ bun preview     # Live Viewer http://localhost:3333
$ bun run build   # video.mp4
```

## 必要なもの

- [Bun](https://bun.sh/) 1.4 以上（npm パッケージは TypeScript ソースを配布し、Bun で直接実行する）
- [ffmpeg / ffprobe](https://ffmpeg.org/)（libx264 付き）
- 日本語フォント（既定は Rounded Mplus 1c。無ければ Noto Sans CJK JP などを探す）
- 音声合成エンジン（[声の設定](docs/voice/voice.md)）
- Windows では WSL で動かす（[Windows 環境構築](docs/install/Windows.md)）

## 最初の動画を作る

[example のチュートリアル](example/README.md) では、ずんだもん・四国めたんを選んだプロジェクトを作り、会話を書くところからプレビュー・書き出しまで順番に進めます。

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

- `<stack>` は重ねて同時に、`<seq>` は順番に再生する。場面の尺はセリフの長さで決まる
- `<Zunda>`・`<Metan>` と立ち絵は、プロジェクト作成時に選んだキャラクターから生成される
- 台本を保存して `bun preview` で確認し、`bun run build` で動画を書き出す

## ドキュメント

- [TSX の書き方](docs/reference/Component.md)
- [組み込みの要素](docs/reference/Syntax.md)
- [声の設定](docs/voice/voice.md)
- [立ち絵](docs/reference/Portrait.md)
- [動画の投稿](docs/reference/Upload.md)（YouTube・ニコニコ動画）
- [設計](docs/reference/Concept.md)
- [開発](docs/dev/Developer.md) / [リリース](docs/dev/Developer.md#リリース)
