import { expect, test } from "bun:test";
import { toXml, type Node } from "@mekuru/core";
import { Subtitle, subtitleText } from "../src/index.tsx";

const render = (children: Node) => toXml(<mekuru>{children}</mekuru>);

test("subtitle defaults and native text overrides", async () => {
  const xml = await render(
    <Subtitle>
      漢字《かんじ》
      <br />
      字幕
    </Subtitle>,
  );
  expect(xml).toContain('x="50%" y="95%" anchor="b" max-w="90%" align="center" size="54" color="#FFFFFF" stroke="#000000" stroke-width="7" z="100"');
  expect(xml).toContain("漢字《かんじ》<br/>字幕</text>");
  const custom = await render(
    <Subtitle x={10} y={20} size={30} color="red" stroke="blue" stroke-width={2} z={5} max-w="50%" anchor="c" align="left" font="custom" id="caption" at={3}>
      text
    </Subtitle>,
  );
  expect(custom).toContain('x="10" y="20" anchor="c" max-w="50%" align="left" size="30" color="#FF0000" stroke="#0000FF" stroke-width="2" z="5"');
  expect(custom).toContain('font="custom" id="caption" delay="3"');
  expect(await render(<text>{await subtitleText("｜表示《よみ》")}</text>)).toContain("<text>表示</text>");
});

test("subtitle styling preserves text components, whitespace, and explicit line breaks", async () => {
  let calls = 0;
  const Words = async () => {
    calls++;
    return (
      <>
        {"  "}
        漢字《かんじ》
        <br /> 次{"  "}
      </>
    );
  };
  const xml = await render(
    <Subtitle pre>
      <Words />
    </Subtitle>,
  );
  expect(xml).toContain('pre="true">  漢字《かんじ》<br/> 次  </text>');
  expect(calls).toBe(1);
});
