import { writeXml } from "@mekuru/tsx";
import { Speech } from "@mekuru/speech";

const Video = () => (
  <mekuru size="1920x1080" fps={30} lang="ja">
    <rect w="100%" h="100%" fill="#141C26" />
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
