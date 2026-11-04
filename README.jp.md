# Mekuru Movie Maker

[English](README.md)

テキストで台本を記述して解説動画を作るツールです。場面の長さはセリフの音声に合わせて決まり、画像・字幕・撮影した動画を同じ時間軸で組み合わせられます。動画のカット・速度変更・一時停止にも対応します。

## 必要なもの

次のコマンドでBunとffmpegを確認し、未導入ならインストールします。

```sh
curl -fsSL https://raw.githubusercontent.com/kanade-k-1228/mekuru/main/install.sh | bash
```

- [Bun](https://bun.sh/) 1.4 以上。パッケージは TypeScript ソースを直接実行します。
- libx264 付き [ffmpeg・ffprobe](https://ffmpeg.org/) と日本語フォント（既定: Rounded Mplus 1c）。
- 使用する声の音声合成エンジン。
- Windows では WSL で実行します。

自動導入はUbuntu/Debian（WSLを含む）のaptと、macOSの [Homebrew](https://brew.sh/) に対応します。aptには管理者権限が必要です。Bunがなければ公式インストーラで導入します。音声エンジンと日本語フォントは別途用意してください。

条件を満たす既存ツールは再利用し、古いBunやlibx264のないffmpegは更新方法を案内して停止します。`MEKURU_FFMPEG`・`MEKURU_FFPROBE` による指定も利用できます。

## はじめる

```sh
bun create @mekuru my-video
cd my-video
bun install
bun preview     # http://localhost:3333
bun run build   # video.mp4
```

作成時に音声合成エンジンを選び、`src/main.tsx` を編集します。`<seq>` は順番に、`<stack>` は同時に再生します。完成までの手順は [最初の動画を作るチュートリアル](example/README.md) を参照してください。

[@mekuru/types](pkgs/types/README.jp.md) が TSX の型・JSX ランタイム・XML 出力、[@mekuru/core](pkgs/core/README.jp.md) がネイティブコンパイラとプレビューサーバーを提供します。ビューアと OS 別バイナリは core に同梱され、生成プロジェクトには両パッケージが設定されます。

## 音声合成エンジン

| パッケージ                                                       | エンジン                        |
| ---------------------------------------------------------------- | ------------------------------- |
| [`@mekuru/voicevox`](pkgs/voicevox/README.jp.md)                 | VOICEVOX・AivisSpeech・SHAREVOX |
| [`@mekuru/voisona`](pkgs/voisona/README.jp.md)                   | VoiSona Talk                    |
| [`@mekuru/coeiroink`](pkgs/coeiroink/README.jp.md)               | COEIROINK                       |
| [`@mekuru/style-bert-vits2`](pkgs/style-bert-vits2/README.jp.md) | Style-Bert-VITS2                |

独自のナレータ（音声＋立ち絵＋字幕）の組み立てには [@mekuru/narrator](pkgs/narrator/README.jp.md) を参照してください。
