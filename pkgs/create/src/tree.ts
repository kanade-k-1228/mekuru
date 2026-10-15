import { Prompt, settings } from "@clack/core";
import {
  formatInstructionFooter,
  limitOptions,
  S_BAR,
  S_BAR_END,
  S_CHECKBOX_ACTIVE,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
  symbol,
  unicodeOr,
} from "@clack/prompts";
import { styleText } from "node:util";

export interface Group<T> {
  label: string;
  hint?: string;
  options: { value: T; label: string }[];
}

const INSTRUCTIONS = [
  `${styleText("dim", "↑/↓")} to navigate`,
  `${styleText("dim", "→/←")} open/close`,
  `${styleText("dim", "Space:")} select`,
  `${styleText("dim", "Enter:")} confirm`,
];

const OPEN = unicodeOr("▾", "v");
const CLOSED = unicodeOr("▸", ">");

type Row = { group: number; option: number };

export const treeMultiselect = async <T>(message: string, groups: Group<T>[]): Promise<T[] | symbol> => {
  const open = new Set<number>();
  let cursor = 0;
  const rows = (): Row[] =>
    groups.flatMap((g, group) => [{ group, option: -1 }, ...(open.has(group) ? g.options.map((_, option) => ({ group, option })) : [])]);
  const chosen = (): T[] => prompt.value ?? [];

  const line = (row: Row, active: boolean): string => {
    const g = groups[row.group];
    const text = (s: string) => (active ? s : styleText("dim", s));
    if (row.option >= 0) {
      const { value, label } = g.options[row.option];
      const box = chosen().includes(value)
        ? styleText("green", S_CHECKBOX_SELECTED)
        : styleText(active ? "cyan" : "dim", active ? S_CHECKBOX_ACTIVE : S_CHECKBOX_INACTIVE);
      return `${styleText("dim", `  ${row.option === g.options.length - 1 ? S_BAR_END : S_BAR}`)} ${box} ${text(label)}`;
    }
    const n = g.options.filter((o) => chosen().includes(o.value)).length;
    const count = n > 0 ? ` ${styleText("dim", `${n}/${g.options.length}`)}` : "";
    const hint = active && g.hint ? ` ${styleText("dim", `(${g.hint})`)}` : "";
    return `${open.has(row.group) ? OPEN : CLOSED} ${text(g.label)}${count}${hint}`;
  };

  const prompt: Prompt<T[]> = new Prompt<T[]>(
    {
      render() {
        const guide = settings.withGuide;
        const head = `${guide ? `${styleText("gray", S_BAR)}\n` : ""}${symbol(this.state)}  ${message}\n`;
        const labels = groups.flatMap((g) => g.options.filter((o) => chosen().includes(o.value)).map((o) => o.label)).join(", ");
        if (this.state === "submit") return `${head}${guide ? styleText("gray", S_BAR) : ""}${labels && `  ${styleText("dim", labels)}`}`;
        if (this.state === "cancel") return `${head}${guide ? styleText("gray", S_BAR) : ""}${labels && `  ${styleText(["strikethrough", "dim"], labels)}`}`;
        const bar = guide ? `${styleText("cyan", S_BAR)}  ` : "";
        const footer = formatInstructionFooter(INSTRUCTIONS, guide);
        const lines = limitOptions({ options: rows(), cursor, columnPadding: 3, rowPadding: head.split("\n").length + footer.length + 1, style: line });
        return `${head}${bar}${lines.join(`\n${bar}`)}\n${footer.join("\n")}\n`;
      },
    },
    false,
  );
  prompt.value = [];
  prompt.on("cursor", (key) => {
    const all = rows();
    const row = all[cursor];
    if (key === "up") cursor = (cursor + all.length - 1) % all.length;
    else if (key === "down") cursor = (cursor + 1) % all.length;
    else if (key === "right") open.add(row.group);
    else if (key === "left") {
      open.delete(row.group);
      cursor = rows().findIndex((r) => r.group === row.group);
    } else if (key === "space" && row.option < 0) {
      if (!open.delete(row.group)) open.add(row.group);
    } else if (key === "space") {
      const { value } = groups[row.group].options[row.option];
      prompt.value = chosen().includes(value) ? chosen().filter((v) => v !== value) : [...chosen(), value];
    }
  });
  return (await prompt.prompt()) ?? [];
};
