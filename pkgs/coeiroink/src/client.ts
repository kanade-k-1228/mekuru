import { cached, type Engine } from "@mekuru/speech";
import type { CoeiroinkProps } from "./index.tsx";

interface Style {
  speaker: string;
  uuid: string;
  style: string;
  id: number;
}

export const client: Engine<CoeiroinkProps>["create"] = (call) => {
  const list = cached(async (): Promise<Style[]> => {
    const speakers = (await (await call("/v1/speakers")).json()) as {
      speakerName: string;
      speakerUuid: string;
      styles: { styleName: string; styleId: number }[];
    }[];
    return speakers.flatMap((s) => s.styles.map((st) => ({ speaker: s.speakerName, uuid: s.speakerUuid, style: st.styleName, id: st.styleId })));
  });

  const find = async (speaker: number | string): Promise<Style> => {
    const [name, style] = String(speaker)
      .split("/")
      .map((s) => s.trim());
    const id = style === undefined && /^\d+$/.test(name) ? Number(name) : undefined;
    const pick = (styles: Style[]) =>
      styles.find((s) => (id !== undefined ? s.id === id : (s.speaker === name || s.uuid === name) && (style === undefined || s.style === style)));
    const found = pick(await list()) ?? pick(await list(true));
    if (found) return found;
    const known = (await list()).map((s) => `${s.speaker}/${s.style}`).join(", ");
    throw new Error(
      `COEIROINK has no speaker \`${speaker}\` (it has ${known || "none"}).\n` +
        "  More characters and styles are downloaded in COEIROINK (キャラクターダウンロード), which is then restarted.",
    );
  };

  return async (voice, text) => {
    const { uuid, id } = await find(voice.speaker);
    const wav = await call("/v1/synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speakerUuid: uuid,
        styleId: id,
        text,
        prosodyDetail: [],
        speedScale: voice.speed ?? 1,
        pitchScale: voice.pitch ?? 0,
        intonationScale: voice.intonation ?? 1,
        volumeScale: voice.volume ?? 1,
        prePhonemeLength: voice.pre ?? 0.1,
        postPhonemeLength: voice.post ?? 0.1,
        pauseLength: voice.pause,
        outputSamplingRate: 48000,
      }),
    });
    return wav.arrayBuffer();
  };
};
