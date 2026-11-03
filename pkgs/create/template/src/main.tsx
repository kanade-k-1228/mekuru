import { writeXml } from "@mekuru/types";

const Video = () => <mekuru size="1920x1080" fps={30}></mekuru>;

await writeXml(".mekuru/main.xml", <Video />);
