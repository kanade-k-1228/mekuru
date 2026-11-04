/** @jsxImportSource @mekuru/types */
import { resolveText, type Node } from "@mekuru/types";

const isKanji = (c: string) => /[一-鿿㐀-䶿豈-﫿々〆ヶ〇]/.test(c);

type Piece = string | { base: string; reading: string };

const rubies = (text: string): Piece[] => {
  const out: Piece[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  for (let i = 0; i < text.length; ) {
    const c = String.fromCodePoint(text.codePointAt(i) ?? 0);
    const rest = text.slice(i + c.length);
    if (c === "｜" || c === "|") {
      const open = rest.indexOf("《");
      const close = rest.indexOf("》", open);
      if (open > 0 && close >= 0 && !/[《》｜]/.test(rest.slice(0, open))) {
        flush();
        out.push({ base: rest.slice(0, open), reading: rest.slice(open + 1, close) });
        i += c.length + close + 1;
        continue;
      }
    }
    if (c === "《" && rest.includes("》")) {
      const chars = [...buf];
      let n = 0;
      while (n < chars.length && isKanji(chars[chars.length - 1 - n])) n++;
      if (n > 0) {
        const base = chars.slice(chars.length - n).join("");
        buf = chars.slice(0, chars.length - n).join("");
        flush();
        out.push({ base, reading: rest.slice(0, rest.indexOf("》")) });
        i += c.length + rest.indexOf("》") + 1;
        continue;
      }
    }
    buf += c;
    i += c.length;
  }
  flush();
  return out;
};

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
  readonly display: Node;
}

/** Parse once, then project to spoken text, a timeline label, and display nodes. */
export const speechText = async (children: Node, reading: Readonly<Record<string, string>> = {}): Promise<LineText> => {
  const words = Object.entries(reading)
    .filter(([word]) => word)
    .sort((a, b) => [...b[0]].length - [...a[0]].length);
  const runs = await resolveText(children);
  let say = "";
  let show = "";
  const display: Node[] = [];
  runs.forEach((run, i) => {
    if (run === null) {
      say += " ";
      show += " ";
      display.push(<br />);
      return;
    }
    const pieces = rubies(run);
    const visible = pieces.map((piece) => (typeof piece === "string" ? piece : piece.base)).join("");
    let spoken = pieces.map((piece) => (typeof piece === "string" ? withReadings(piece, words) : piece.reading)).join("");
    let label = visible;
    if (i === 0 || runs[i - 1] === null) {
      spoken = spoken.trimStart();
      label = label.trimStart();
    }
    if (i === runs.length - 1 || runs[i + 1] === null) {
      spoken = spoken.trimEnd();
      label = label.trimEnd();
    }
    say += spoken;
    show += label;
    display.push(visible);
  });
  return Object.freeze({ say: say.trim(), show: show.trim(), display });
};
