import { expect, test } from "bun:test";
import { toXml, type Node } from "@mekuru/types";
import { Subtitle } from "../src/index.tsx";

const render = (children: Node) => toXml(<mekuru>{children}</mekuru>);

test("subtitle defaults and native text overrides", async () => {
  const xml = await render(<Subtitle text={"漢字\n字幕"} />);
  expect(xml).toContain(
    'x="50%" y="95%" anchor="b" max-w="90%" align="center" size="54" color="#FFFFFF" stroke="#000000" stroke-width="7" z="100" text="漢字&#10;字幕"/>',
  );
  const custom = await render(
    <Subtitle
      x={10}
      y={20}
      size={30}
      color="red"
      stroke="blue"
      stroke-width={2}
      z={5}
      max-w="50%"
      anchor="c"
      align="left"
      font="custom"
      id="caption"
      at={3}
      text="text"
    />,
  );
  expect(custom).toContain('x="10" y="20" anchor="c" max-w="50%" align="left" size="30" color="#FF0000" stroke="#0000FF" stroke-width="2" z="5"');
  expect(custom).toContain('font="custom" id="caption" delay="3" text="text"/>');
});

test("subtitle passes its text through as it is", async () => {
  expect(await render(<Subtitle text={"  漢字\n 次  "} />)).toContain('text="  漢字&#10; 次  "/>');
});
