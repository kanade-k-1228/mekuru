# Mekuru Movie Maker

[English](README.md)

テキストで台本を記述して解説動画を作るツールです。場面の長さはセリフの音声に合わせて決まり、画像・字幕・撮影した動画を同じ時間軸で組み合わせられます。動画のカット・速度変更・一時停止にも対応します。

## はじめる

### 1. 必要なものを入れる

次のコマンドで必要なものを入れます。

```sh
curl -fsSL https://raw.githubusercontent.com/kanade-k-1228/mekuru/main/install.sh | bash
```

- [Bun](https://bun.sh/) 1.4 以上
- libx264 付き [ffmpeg・ffprobe](https://ffmpeg.org/)
- Noto Sans フォント（既定のフォント）

> 自動導入は Ubuntu/Debian（WSL を含む）の apt と、macOS の [Homebrew](https://brew.sh/) に対応します。apt には管理者権限が必要です。Bun がなければ公式インストーラで導入します。

> 条件を満たす既存ツールは再利用し、古い Bun や libx264 のない ffmpeg は更新方法を案内して停止します。`MEKURU_FFMPEG`・`MEKURU_FFPROBE` による指定も利用できます。

### 2. プロジェクトを作る

```sh
bun create @mekuru my-video
cd my-video
bun install
bun run irodoru # 別のターミナルで起動したままにする（Docker が必要）
bun preview     # http://localhost:3333
bun run build   # video.mp4
```

### 3. 動画を編集する

```tsx
// src/main.tsx
import { writeXml } from "@mekuru/tsx";
import { Speech } from "@mekuru/speech";

const Video = () => (
  <mekuru size="1920x1080" fps={30} lang="ja">
    <rect w="100%" h="100%" fill="#141C26" />
    {/* <stack> の中は同時に、<seq> の中は順番に再生します */}
    <stack>
      <text x="50%" y="40%" anchor="center" size={90} text="はじめての動画" />
      <seq>
        <Speech caption="明るく聞き取りやすい声" text="こんにちは。" />
        <Speech caption="明るく聞き取りやすい声" text="タイトルは、セリフが終わるまで表示されます。" />
      </seq>
    </stack>
  </mekuru>
);

await writeXml(".mekuru/main.xml", <Video />);
```

既定の「irodoru sample」には、このサンプルと必要なパッケージが入っています。`bun run irodoru` でビルド済み Docker イメージを起動します（初回はダウンロード、終了は Ctrl+C）。VOICEVOX は `bun run voicevox` と `@mekuru/speech/voicevox` で使えます。接続先は `MEKURU_IRODORU_URL` / `MEKURU_VOICEVOX_URL` で変更できます。空の台本から始める場合は「Empty project」か `--template empty` を選びます。[チュートリアル](example/README.md)・[音声合成の設定](pkgs/speech/README.jp.md)。

> [@mekuru/tsx](pkgs/tsx/README.jp.md) が TSX の型・JSX ランタイム・XML 出力、[@mekuru/core](pkgs/core/README.jp.md) がネイティブコンパイラとプレビューサーバーを提供します。ビューアと OS 別バイナリは core に同梱され、生成プロジェクトには両パッケージが設定されます。
