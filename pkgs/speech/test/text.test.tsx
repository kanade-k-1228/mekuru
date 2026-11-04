import { expect, test } from "bun:test";
import { toXml, type Node } from "@mekuru/tsx";
import { speechText, subtitleText } from "../src/text.tsx";

const display = async (text: Node) => {
  const xml = await toXml(
    <mekuru>
      <text text={await subtitleText(text)} />
    </mekuru>,
  );
  return `${xml.split("\n")[2].trim()}\n`;
};

test("dictionaries change only the spoken text, and lines break on \\n", async () => {
  const text = " Mekuruと漢字、Bun\nAPIです。 ";
  expect(await speechText(text, { API: "エーピーアイ", A: "エー", Mekuru: "めくる", Bun: "バン" })).toMatchObject({
    say: "めくると漢字、バン エーピーアイです。",
    show: "Mekuruと漢字、Bun APIです。",
  });
  expect(await display(text)).toBe('<text text="Mekuruと漢字、Bun&#10;APIです。"/>\n');
});

test("arrays, fragments and numbers make one string", async () => {
  const text = <>{[null, false, <> 漢{"字"}</>, 123, "\n\n 次 "]}</>;
  expect(await speechText(text)).toMatchObject({ say: "漢字123  次", show: "漢字123  次" });
  expect(await display(text)).toBe('<text text="漢字123&#10;&#10;次"/>\n');
  expect(await display("\na\n")).toBe('<text text="&#10;a&#10;"/>\n');
});

test("longest dictionary match wins, and ruby-like marks are plain text", async () => {
  expect(await speechText("API A 漢字《かんじ》", { A: "短", API: "長", "": "ignored" })).toMatchObject({
    say: "長 短 漢字《かんじ》",
    show: "API A 漢字《かんじ》",
  });
  expect(await speechText([null, undefined, false, "  "])).toMatchObject({ say: "", show: "" });
});

test("text components expand once", async () => {
  let calls = 0;
  const Custom = async () => {
    calls++;
    return <>漢{"字\n 次"}</>;
  };
  const result = await speechText(
    // biome-ignore lint/complexity/noUselessFragments: verify transparent wrappers
    <>
      <Custom />
    </>,
    { 漢字: "かんじ" },
  );
  expect(result).toMatchObject({ say: "かんじ 次", show: "漢字 次", display: "漢字\n次" });
  expect(calls).toBe(1);
});

test("non-text output is rejected after ordinary component expansion", async () => {
  const Custom = () => <image src="a.png" />;
  for (const node of [<image src="a.png" />, <Custom />]) {
    await expect(speechText(node)).rejects.toThrow("a line of speech is text");
  }
});
