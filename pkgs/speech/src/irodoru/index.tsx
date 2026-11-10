/** @jsxImportSource @mekuru/tsx */
import { Audio, type JSX } from "@mekuru/tsx";
import { lineText, prepareLine, type LineProps } from "../shared/line.ts";
import { requestFor, synthesize, type IrodoruOptions } from "./client.ts";

export interface SpeechProps extends LineProps, IrodoruOptions {
  /** Defaults to MEKURU_IRODORU_URL or http://127.0.0.1:8080. */
  url?: string;
  /** Maximum Unicode characters per request (1–1000, default 100). */
  "max-chars"?: number;
}

const prepare = async (props: Omit<SpeechProps, "id" | "at">) => {
  const text = await lineText(props);
  const request = requestFor(props, text.say);
  return prepareLine(props, text, "irodoru", { irodoru: request }, (out) => synthesize(request, out));
};

export const Speech = Object.assign(
  async (props: SpeechProps): Promise<Awaited<JSX.Element>> => {
    const line = await prepare(props);
    return <Audio source={line.audio} id={props.id} at={props.at} />;
  },
  { prepare },
);
