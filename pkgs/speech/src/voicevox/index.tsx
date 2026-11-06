/** @jsxImportSource @mekuru/tsx */
import { Audio } from "@mekuru/audio";
import type { JSX } from "@mekuru/tsx";
import { lineText, prepareLine, type LineProps } from "../shared/line.ts";
import { requestFor, synthesize, type VoicevoxOptions } from "./client.ts";

export interface VoicevoxProps extends LineProps, VoicevoxOptions {
  /** Defaults to MEKURU_VOICEVOX_URL or http://127.0.0.1:50021. */
  url?: string;
}

const prepare = async (props: Omit<VoicevoxProps, "id" | "at">) => {
  const text = await lineText(props);
  const request = requestFor(props, text.say);
  return prepareLine(props, text, String(props.speaker), { voicevox: request }, (out) => synthesize(request, out));
};

export const Voicevox = Object.assign(
  async (props: VoicevoxProps): Promise<Awaited<JSX.Element>> => {
    const line = await prepare(props);
    return <Audio source={line.audio} id={props.id} at={props.at} />;
  },
  { prepare },
);

export * from "./characters.ts";
