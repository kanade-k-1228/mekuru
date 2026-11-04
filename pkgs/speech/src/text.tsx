import { resolveText, type Node } from "@mekuru/types";

const withReadings = (text: string, words: [string, string][]): string => {
  if (words.length === 0) return text;
  let out = "";
  outer: for (let i = 0; i < text.length; ) {
    for (const [word, as] of words) {
      if (text.startsWith(word, i)) {
        out += as;
        i += word.length;
        continue outer;
      }
    }
    const c = String.fromCodePoint(text.codePointAt(i) ?? 0);
    out += c;
    i += c.length;
  }
  return out;
};

interface LineText {
  readonly say: string;
  readonly show: string;
  readonly display: string;
}

/** Expand once, then project to spoken text, a timeline label, and the displayed string. "\n" breaks a line. */
export const speechText = async (text: Node, reading: Readonly<Record<string, string>> = {}): Promise<LineText> => {
  const words = Object.entries(reading)
    .filter(([word]) => word)
    .sort((a, b) => [...b[0]].length - [...a[0]].length);
  const lines = (await resolveText(text)).split("\n").map((line) => ({ visible: line.trim(), spoken: withReadings(line, words).trim() }));
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
