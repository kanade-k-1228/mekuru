import { expect, test } from "bun:test";
import { toXml, type Node } from "@mekuru/types";
import { speechText, subtitleText } from "../src/text.tsx";

const display = async (children: Node) => {
  const xml = await toXml(
    <mekuru>
      <text>{await subtitleText(children)}</text>
    </mekuru>,
  );
  return `${xml.split("\n")[2].trim()}\n`;
};

test("ruby and dictionaries keep existing spoken text and labels", async () => {
  const children = (
    <>
      {" "}
      ｜Mekuru《めくる》と漢字《かんじ》、|Bun《バン》
      <br />
      APIです。{" "}
    </>
  );
  expect(await speechText(children, { API: "エーピーアイ", A: "エー", Mekuru: "別の読み" })).toMatchObject({
    say: "めくるとかんじ、バン エーピーアイです。",
    show: "Mekuruと漢字、Bun APIです。",
  });
  expect(await display(children)).toBe("<text> Mekuruと漢字、Bun<br/>APIです。 </text>\n");
});

test("arrays, fragments, numbers and ruby spanning adjacent text nodes", async () => {
  const children = (
    <>
      {[null, false, <> 漢{"字《かんじ》"}</>, 123]}
      <br />
      <br /> 次{" "}
    </>
  );
  expect(await speechText(children)).toMatchObject({ say: "かんじ123  次", show: "漢字123  次" });
  expect(await display(children)).toBe("<text> 漢字123<br/><br/> 次 </text>\n");
  expect(
    await display(
      <>
        <br />a<br />
      </>,
    ),
  ).toBe("<text><br/>a<br/></text>\n");
});

test("longest dictionary match wins and unmatched ruby stays literal", async () => {
  expect(await speechText("API A |broken《text", { A: "短", API: "長", "": "ignored" })).toMatchObject({
    say: "長 短 |broken《text",
    show: "API A |broken《text",
  });
  expect(await speechText([null, undefined, false, "  "])).toMatchObject({ say: "", show: "" });
});

test("text components expand once and fragments preserve ruby parsing", async () => {
  let calls = 0;
  const Custom = async () => {
    calls++;
    return (
      <>
        漢{"字《かんじ》"}
        <br /> 次
      </>
    );
  };
  const result = await speechText(
    // biome-ignore lint/complexity/noUselessFragments: verify transparent wrappers
    <>
      <Custom />
    </>,
  );
  expect(result.say).toBe("かんじ 次");
  expect(calls).toBe(1);
  const xml = await toXml(
    <mekuru>
      <text pre>{result.display}</text>
    </mekuru>,
  );
  expect(xml).toContain('pre="true">漢字<br/> 次</text>');
  expect(calls).toBe(1);
  expect(
    await speechText(
      <>
        漢字《かんじ》
        <br /> 次
      </>,
    ),
  ).toMatchObject({ say: result.say, show: result.show });
});

test("non-text output is rejected after ordinary component expansion", async () => {
  const Custom = () => <image src="a.png" />;
  for (const node of [<image src="a.png" />, <Custom />]) {
    await expect(speechText(node)).rejects.toThrow("a line of speech is text");
    await expect(subtitleText(node)).rejects.toThrow("a line of speech is text");
  }
});
