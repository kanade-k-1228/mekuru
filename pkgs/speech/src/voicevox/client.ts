import { cached, type Engine } from "../engine.ts";
import type { VoicevoxProps } from "./index.tsx";

export const client: Engine<VoicevoxProps>["create"] = (call, url) => {
  const styles = cached(async () => {
    const speakers = (await (await call("/speakers")).json()) as { name: string; styles: { name: string; id: number }[] }[];
    return speakers.flatMap((s) => s.styles.map((st) => ({ speaker: s.name, style: st.name, id: st.id })));
  });

  const styleId = async (speaker: number | string): Promise<number> => {
    if (typeof speaker === "number") return speaker;
    if (/^\s*\d+\s*$/.test(speaker)) return Number(speaker);
    const [name, style] = speaker.split("/").map((s) => s.trim());
    const found = (await styles()).find((s) => s.speaker === name && (style === undefined || s.style === style));
    if (!found) throw new Error(`VOICEVOX has no speaker \`${speaker}\` (see ${url}/speakers for the list)`);
    return found.id;
  };

  return async (voice, text) => {
    const id = await styleId(voice.speaker);
    const query = (await (await call(`/audio_query?speaker=${id}&text=${encodeURIComponent(text)}`, { method: "POST" })).json()) as Record<string, unknown>;
    const set = (key: string, value: number | undefined) => {
      if (value !== undefined) query[key] = value;
    };
    set("speedScale", voice.speed);
    set("pitchScale", voice.pitch);
    set("intonationScale", voice.intonation);
    set("volumeScale", voice.volume);
    set("prePhonemeLength", voice.pre);
    set("postPhonemeLength", voice.post);
    set("pauseLengthScale", voice["pause-scale"]);
    query.outputSamplingRate = 48000;
    query.outputStereo = false;
    const wav = await call(`/synthesis?speaker=${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    return wav.arrayBuffer();
  };
};
