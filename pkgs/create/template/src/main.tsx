import { writeXml } from "@mekuru/core";

const Video = () => <mekuru size="1920x1080" fps={30}></mekuru>;

await writeXml(".mekuru/main.xml", <Video />);
