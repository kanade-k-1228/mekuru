import type { Engine } from "@mekuru/speech";
import type { StyleBertVits2Props } from "./index.tsx";

interface ModelInfo {
  model_path: string;
  spk2id: Record<string, number>;
  style2id: Record<string, number>;
}

export const client: Engine<StyleBertVits2Props>["create"] = (call) => async (voice, text) => {
  const models = Object.values((await (await call("/models/info")).json()) as Record<string, ModelInfo>);
  const name = (m: ModelInfo) => m.model_path.split(/[\\/]/).at(-2);
  const model = models.find((m) => name(m) === voice.model);
  if (!model) throw new Error(`Style-Bert-VITS2 has no model \`${voice.model}\` (it has ${models.map(name).join(", ")})`);
  const { speaker, style } = voice;
  if (speaker !== undefined && !(typeof speaker === "number" ? Object.values(model.spk2id).includes(speaker) : Object.hasOwn(model.spk2id, speaker))) {
    throw new Error(`the Style-Bert-VITS2 model \`${voice.model}\` has no speaker \`${speaker}\` (it has ${Object.keys(model.spk2id).join(", ")})`);
  }
  if (style !== undefined && !Object.hasOwn(model.style2id, style)) {
    throw new Error(`the Style-Bert-VITS2 model \`${voice.model}\` has no style \`${style}\` (it has ${Object.keys(model.style2id).join(", ")})`);
  }
  const query = new URLSearchParams({ text, model_name: voice.model, language: voice.language ?? "JP" });
  const set = (key: string, value: number | string | undefined) => {
    if (value !== undefined) query.set(key, String(value));
  };
  set(typeof speaker === "number" ? "speaker_id" : "speaker_name", speaker);
  set("style", style);
  set("style_weight", voice["style-weight"]);
  set("sdp_ratio", voice["sdp-ratio"]);
  set("noise", voice.noise);
  set("noisew", voice["noise-w"]);
  set("length", voice.length);
  set("assist_text", voice["assist-text"]);
  set("assist_text_weight", voice["assist-text-weight"]);
  return (await call(`/voice?${query}`, { method: "POST" })).arrayBuffer();
};
