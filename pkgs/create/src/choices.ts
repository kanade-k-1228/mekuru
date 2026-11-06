export const TEMPLATES = {
  sample: { name: "irodoru sample", hint: "speech sample with Docker commands for irodoru and VOICEVOX" },
  empty: { name: "Empty project", hint: "a blank script, with no speech server needed" },
} as const;
export type Template = keyof typeof TEMPLATES;
export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as Template[];

const DOCS = "https://github.com/kanade-k-1228/mekuru/blob/main/docs/reference/Upload.jp.md";
const MULTILINE = "# 複数行は「description: |」として、次の行から字下げして書く";

export const SITES = {
  youtube: {
    name: "YouTube",
    hint: "uploads it, with an OAuth client of your Google Cloud project",
    pkg: "@mekuru/upload",
    bin: "mekuru-youtube",
    settings: (title: string) => `# bun run upload:youtube の設定（${DOCS}）。パスはプロジェクトのフォルダから書く
video: video.mp4
title: ${JSON.stringify(title)}
description: "" ${MULTILINE}
tags: []
privacy: private # private・unlisted・public
# category: 27 # 22: ブログ（既定）、27: 教育、28: 科学と技術
# thumbnail: configs/thumbnail.png
`,
  },
  niconico: {
    name: "niconico",
    hint: "posts it by filling in the upload page in a headless browser (niconico has no API)",
    pkg: "@mekuru/upload",
    bin: "mekuru-niconico",
    settings: (title: string) => `# bun run upload:niconico の設定（${DOCS}）。パスはプロジェクトのフォルダから書く
video: video.mp4
title: ${JSON.stringify(title)}
description: "" ${MULTILINE}
tags: []
# thumbnail: configs/thumbnail.png
`,
  },
} as const;
export type Site = keyof typeof SITES;
export const SITE_NAMES = Object.keys(SITES) as Site[];
