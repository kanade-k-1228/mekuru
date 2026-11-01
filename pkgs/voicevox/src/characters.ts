import type { VoicevoxProps } from "./index.tsx";

const AIVISSPEECH = process.env.MEKURU_AIVISSPEECH_URL || "http://127.0.0.1:10101";
const SHAREVOX = process.env.MEKURU_SHAREVOX_URL || "http://127.0.0.1:50025";

// VOICEVOX
export const zunda = { name: "ずんだもん", speaker: 3 } satisfies Partial<VoicevoxProps>;
export const metan = { name: "四国めたん", speaker: 2 } satisfies Partial<VoicevoxProps>;
export const tsumugi = { name: "春日部つむぎ", speaker: 8 } satisfies Partial<VoicevoxProps>;
export const hau = { name: "雨晴はう", speaker: 10 } satisfies Partial<VoicevoxProps>;
export const ritsu = { name: "波音リツ", speaker: 9 } satisfies Partial<VoicevoxProps>;
export const takehiro = { name: "玄野武宏", speaker: 11 } satisfies Partial<VoicevoxProps>;
export const kotaro = { name: "白上虎太郎", speaker: 12 } satisfies Partial<VoicevoxProps>;
export const ryusei = { name: "青山龍星", speaker: 13 } satisfies Partial<VoicevoxProps>;
export const himari = { name: "冥鳴ひまり", speaker: 14 } satisfies Partial<VoicevoxProps>;
export const sora = { name: "九州そら", speaker: 16 } satisfies Partial<VoicevoxProps>;
export const mochiko = { name: "もち子さん", speaker: 20 } satisfies Partial<VoicevoxProps>;
export const mesuo = { name: "剣崎雌雄", speaker: 21 } satisfies Partial<VoicevoxProps>;
export const zunko = { name: "東北ずん子", speaker: 107 } satisfies Partial<VoicevoxProps>;
export const kiritan = { name: "東北きりたん", speaker: 108 } satisfies Partial<VoicevoxProps>;
export const itako = { name: "東北イタコ", speaker: 109 } satisfies Partial<VoicevoxProps>;

// AivisSpeech
export const kohaku = { name: "コハク", speaker: "コハク", url: AIVISSPEECH } satisfies Partial<VoicevoxProps>;
export const mao = { name: "まお", speaker: "まお", url: AIVISSPEECH } satisfies Partial<VoicevoxProps>;

// SHAREVOX
export const koharuneAmiSharevox = { name: "小春音アミ", speaker: 14, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const tsukuyomiSharevox = { name: "つくよみちゃん", speaker: 18, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const ykun = { name: "Yくん", speaker: 19, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const hakuchi = { name: "白痴ー", speaker: 20, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const lagopusBlack = { name: "らごぱすブラック", speaker: 21, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const lagopusWhite = { name: "らごぱすホワイト", speaker: 22, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const yuki = { name: "風花ゆき", speaker: 23, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const hiroha = { name: "安倍広葉", speaker: 24, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
export const suzuno = { name: "鈴乃", speaker: 25, url: SHAREVOX } satisfies Partial<VoicevoxProps>;
