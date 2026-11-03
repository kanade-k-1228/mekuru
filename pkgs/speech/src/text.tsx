/** @jsxImportSource @mekuru/core */
import type { Node } from "@mekuru/core";
import { Fragment } from "@mekuru/core/jsx-runtime";

const BREAK = Symbol("br");
type Run = string | typeof BREAK;

const runs = (node: Node, out: Run[] = []): Run[] => {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (Array.isArray(node)) {
    for (const n of node) runs(n, out);
  } else if (typeof node === "object" && "tag" in node) {
    if (node.tag === Fragment) runs(node.children, out);
    else if (node.tag === "br") out.push(BREAK);
    else throw new Error(`a line of speech is text (and \`<br />\`), not ${typeof node.tag === "string" ? `<${node.tag}>` : "a component"}`);
  } else {
    const last = out[out.length - 1];
    if (typeof last === "string") out[out.length - 1] = last + String(node);
    else out.push(String(node));
  }
  return out;
};

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

const normalizedRuns = (children: Node): Run[] => {
  const line = runs(children);
  return line.map((run, i) => {
    if (run === BREAK) return run;
    let text = run;
    if (i === 0 || line[i - 1] === BREAK) text = text.trimStart();
    if (i === line.length - 1 || line[i + 1] === BREAK) text = text.trimEnd();
    return text;
  });
};

export const subtitleText = (children: Node): Node =>
  normalizedRuns(children).map((run) =>
    run === BREAK ? (
      <br />
    ) : (
      rubies(run)
        .map((piece) => (typeof piece === "string" ? piece : piece.base))
        .join("")
    ),
  );

export const speechText = (children: Node, reading: Readonly<Record<string, string>> = {}): { say: string; show: string } => {
  const words = Object.entries(reading)
    .filter(([word]) => word)
    .sort((a, b) => [...b[0]].length - [...a[0]].length);
  const line = normalizedRuns(children);
  let say = "";
  let show = "";
  line.forEach((run) => {
    if (run === BREAK) {
      say += " ";
      show += " ";
      return;
    }
    for (const piece of rubies(run)) {
      say += typeof piece === "string" ? withReadings(piece, words) : piece.reading;
      show += typeof piece === "string" ? piece : piece.base;
    }
  });
  return { say: say.trim(), show: show.trim() };
};
