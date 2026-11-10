import { resolveText, type Node } from "@mekuru/tsx";

interface LineText {
  readonly say: string;
  readonly show: string;
  readonly display: string;
}

/** Expand once, then project to spoken text, a timeline label, and the displayed string. "\n" breaks a line. */
export const speechText = async (text: Node, reading: Readonly<Record<string, string>> = {}): Promise<LineText> => {
  // At each position the longest word wins: the alternatives are tried in this order.
  const words = Object.keys(reading)
    .filter(Boolean)
    .sort((a, b) => [...b].length - [...a].length)
    .map((word) => word.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"));
  const spoken = (line: string) => (words.length ? line.replace(new RegExp(words.join("|"), "gu"), (word) => reading[word]) : line);
  const lines = (await resolveText(text)).split("\n").map((line) => ({ visible: line.trim(), spoken: spoken(line).trim() }));
  const say = lines
    .map((line) => line.spoken)
    .join(" ")
    .trim();
  const show = lines
    .map((line) => line.visible)
    .join(" ")
    .trim();
  return Object.freeze({ say, show, display: lines.map((line) => line.visible).join("\n") });
};

export const subtitleText = async (text: Node): Promise<string> => (await speechText(text)).display;
