import { writeXml } from "@mekuru/tsx";

const Video = () => <mekuru size="1920x1080" fps={30} lang="ja" />;

await writeXml(".mekuru/main.xml", <Video />);
