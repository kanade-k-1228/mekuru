/** @jsxImportSource @mekuru/types */
import type { JSX } from "@mekuru/types";
import { Audio } from "@mekuru/audio";
import type { PreparedLine, SpeechProps } from "./index.tsx";

export const defineSpeech = <P extends SpeechProps>(prepare: (props: Omit<P, "id" | "at">) => Promise<PreparedLine>) =>
  Object.assign(
    async (props: P): Promise<Awaited<JSX.Element>> => {
      const line = await prepare(props);
      return <Audio source={line.audio} id={props.id} at={props.at} />;
    },
    { prepare },
  );
