import { expect, test } from "bun:test";
import { toXml, type Node } from "@mekuru/core";
import { speechText, subtitleText } from "../src/text.tsx";

const display = async (children: Node) => {
  const xml = await toXml(
    <mekuru>
      <text>{subtitleText(children)}</text>
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
  expect(speechText(children, { API: "エーピーアイ", A: "エー", Mekuru: "別の読み" })).toEqual({
    say: "めくるとかんじ、バン エーピーアイです。",
    show: "Mekuruと漢字、Bun APIです。",
  });
  expect(await display(children)).toBe("<text>Mekuruと漢字、Bun<br/>APIです。</text>\n");
});

test("arrays, fragments, numbers and ruby spanning adjacent text nodes", async () => {
  const children = (
    <>
      {[null, false, <> 漢{"字《かんじ》"}</>, 123]}
      <br />
      <br /> 次{" "}
    </>
  );
  expect(speechText(children)).toEqual({ say: "かんじ123  次", show: "漢字123  次" });
  expect(await display(children)).toBe("<text>漢字123<br/><br/>次</text>\n");
  expect(
    await display(
      <>
        <br />a<br />
      </>,
    ),
  ).toBe("<text><br/>a<br/></text>\n");
});

test("longest dictionary match wins and unmatched ruby stays literal", () => {
  expect(speechText("API A |broken《text", { A: "短", API: "長", "": "ignored" })).toEqual({
    say: "長 短 |broken《text",
    show: "API A |broken《text",
  });
  expect(speechText([null, undefined, false, "  "])).toEqual({ say: "", show: "" });
});

test("speech and subtitles reject non-text components without executing them", () => {
  let calls = 0;
  const Custom = () => {
    calls++;
    return <br />;
  };
  for (const node of [<image src="a.png" />, <Custom />]) {
    expect(() => speechText(node)).toThrow("a line of speech is text");
    expect(() => subtitleText(node)).toThrow("a line of speech is text");
  }
  expect(calls).toBe(0);
});
