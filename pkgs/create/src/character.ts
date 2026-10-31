export const ENGINES = {
  voicevox: { component: "Voicevox", name: "VOICEVOX", hint: "free: the app, or the engine in Docker", pkg: "@mekuru/voicevox" },
  aivisspeech: {
    component: "Voicevox",
    url: { env: "MEKURU_AIVISSPEECH_URL", default: "http://127.0.0.1:10101" },
    name: "AivisSpeech",
    hint: "free: the app, or the engine in Docker",
    pkg: "@mekuru/voicevox",
  },
  coeiroink: { component: "Coeiroink", name: "COEIROINK", hint: "free: the app (v2); download the characters in it", pkg: "@mekuru/coeiroink" },
  sharevox: {
    component: "Voicevox",
    url: { env: "MEKURU_SHAREVOX_URL", default: "http://127.0.0.1:50025" },
    name: "SHAREVOX",
    hint: "free: the app (no longer updated)",
    pkg: "@mekuru/voicevox",
  },
  "style-bert-vits2": { component: "StyleBertVits2", name: "Style-Bert-VITS2", hint: "free: its API server", pkg: "@mekuru/style-bert-vits2" },
} as const;
export type Engine = keyof typeof ENGINES;
export const ENGINE_NAMES = Object.keys(ENGINES) as Engine[];

type CharacterDefinition = {
  name: string;
  component: string;
  stroke: string;
  x: `${number}%`;
} & (
  | { engine: "voicevox" | "aivisspeech" | "sharevox"; voice: { speaker: number | string } }
  | { engine: "coeiroink"; voice: { speaker: number | string } }
  | { engine: "style-bert-vits2"; voice: { model: string } }
);

export const CHARACTERS = {
  zunda: { name: "ずんだもん", engine: "voicevox", component: "Zunda", voice: { speaker: 3 }, stroke: "#2E6B30", x: "85%" },
  metan: { name: "四国めたん", engine: "voicevox", component: "Metan", voice: { speaker: 2 }, stroke: "#8E2457", x: "15%" },
  tsumugi: { name: "春日部つむぎ", engine: "voicevox", component: "Tsumugi", voice: { speaker: 8 }, stroke: "#B05A00", x: "85%" },
  hau: { name: "雨晴はう", engine: "voicevox", component: "Hau", voice: { speaker: 10 }, stroke: "#2A7F8F", x: "15%" },
  ritsu: { name: "波音リツ", engine: "voicevox", component: "Ritsu", voice: { speaker: 9 }, stroke: "#A11D2B", x: "85%" },
  takehiro: { name: "玄野武宏", engine: "voicevox", component: "Takehiro", voice: { speaker: 11 }, stroke: "#3A4A6B", x: "15%" },
  kotaro: { name: "白上虎太郎", engine: "voicevox", component: "Kotaro", voice: { speaker: 12 }, stroke: "#8A6100", x: "85%" },
  ryusei: { name: "青山龍星", engine: "voicevox", component: "Ryusei", voice: { speaker: 13 }, stroke: "#1F4E9B", x: "15%" },
  himari: { name: "冥鳴ひまり", engine: "voicevox", component: "Himari", voice: { speaker: 14 }, stroke: "#5B3A8E", x: "85%" },
  sora: { name: "九州そら", engine: "voicevox", component: "Sora", voice: { speaker: 16 }, stroke: "#2A6FB0", x: "15%" },
  mochiko: { name: "もち子さん", engine: "voicevox", component: "Mochiko", voice: { speaker: 20 }, stroke: "#B0567A", x: "85%" },
  mesuo: { name: "剣崎雌雄", engine: "voicevox", component: "Mesuo", voice: { speaker: 21 }, stroke: "#6B2E2E", x: "15%" },
  zunko: { name: "東北ずん子", engine: "voicevox", component: "Zunko", voice: { speaker: 107 }, stroke: "#4F7A28", x: "85%" },
  kiritan: { name: "東北きりたん", engine: "voicevox", component: "Kiritan", voice: { speaker: 108 }, stroke: "#8B3A2F", x: "15%" },
  itako: { name: "東北イタコ", engine: "voicevox", component: "Itako", voice: { speaker: 109 }, stroke: "#7A3B6E", x: "85%" },
  kohaku: { name: "コハク", engine: "aivisspeech", component: "Kohaku", voice: { speaker: "コハク" }, stroke: "#A86A10", x: "15%" },
  mao: { name: "まお", engine: "aivisspeech", component: "Mao", voice: { speaker: "まお" }, stroke: "#C0587E", x: "85%" },
  tsukuyomi: { name: "つくよみちゃん", engine: "coeiroink", component: "Tsukuyomi", voice: { speaker: "つくよみちゃん" }, stroke: "#4B4E8C", x: "15%" },
  mana: { name: "MANA", engine: "coeiroink", component: "Mana", voice: { speaker: "MANA" }, stroke: "#C2185B", x: "85%" },
  kana: { name: "KANA", engine: "coeiroink", component: "Kana", voice: { speaker: "KANA" }, stroke: "#5E7D2E", x: "15%" },
  ofutonp: { name: "おふとんP", engine: "coeiroink", component: "Ofutonp", voice: { speaker: "おふとんP" }, stroke: "#8D6E63", x: "85%" },
  ayaka: { name: "AI声優-朱花", engine: "coeiroink", component: "Ayaka", voice: { speaker: "AI声優-朱花" }, stroke: "#C62828", x: "15%" },
  aoba: { name: "AI声優-青葉", engine: "coeiroink", component: "Aoba", voice: { speaker: "AI声優-青葉" }, stroke: "#2E7D32", x: "85%" },
  ginga: { name: "AI声優-銀芽", engine: "coeiroink", component: "Ginga", voice: { speaker: "AI声優-銀芽" }, stroke: "#546E7A", x: "15%" },
  kanae: { name: "AI声優-金苗", engine: "coeiroink", component: "Kanae", voice: { speaker: "AI声優-金苗" }, stroke: "#A07800", x: "85%" },
  dia: { name: "ディアちゃん", engine: "coeiroink", component: "Dia", voice: { speaker: "ディアちゃん" }, stroke: "#6A1B9A", x: "15%" },
  arma: { name: "アルマちゃん", engine: "coeiroink", component: "Arma", voice: { speaker: "アルマちゃん" }, stroke: "#880E4F", x: "85%" },
  lilin: { name: "リリンちゃん", engine: "coeiroink", component: "Lilin", voice: { speaker: "リリンちゃん" }, stroke: "#AD1457", x: "15%" },
  croix: { name: "クロワちゃん", engine: "coeiroink", component: "Croix", voice: { speaker: "クロワちゃん" }, stroke: "#37474F", x: "85%" },
  andzie: { name: "アンジーさん", engine: "coeiroink", component: "Andzie", voice: { speaker: "アンジーさん" }, stroke: "#8E3B5F", x: "15%" },
  ameno: { name: "アメノちゃん", engine: "coeiroink", component: "Ameno", voice: { speaker: "アメノちゃん" }, stroke: "#0277BD", x: "85%" },
  "koharune-ami-sharevox": { name: "小春音アミ", engine: "sharevox", component: "KoharuneAmiSharevox", voice: { speaker: 14 }, stroke: "#D25C8A", x: "15%" },
  "tsukuyomi-sharevox": { name: "つくよみちゃん", engine: "sharevox", component: "TsukuyomiSharevox", voice: { speaker: 18 }, stroke: "#4B4E8C", x: "85%" },
  ykun: { name: "Yくん", engine: "sharevox", component: "Ykun", voice: { speaker: 19 }, stroke: "#3E6A8A", x: "15%" },
  hakuchi: { name: "白痴ー", engine: "sharevox", component: "Hakuchi", voice: { speaker: 20 }, stroke: "#5A5A6E", x: "85%" },
  "lagopus-black": { name: "らごぱすブラック", engine: "sharevox", component: "LagopusBlack", voice: { speaker: 21 }, stroke: "#2B2B3A", x: "15%" },
  "lagopus-white": { name: "らごぱすホワイト", engine: "sharevox", component: "LagopusWhite", voice: { speaker: 22 }, stroke: "#6E7F99", x: "85%" },
  yuki: { name: "風花ゆき", engine: "sharevox", component: "Yuki", voice: { speaker: 23 }, stroke: "#4F8FBF", x: "15%" },
  hiroha: { name: "安倍広葉", engine: "sharevox", component: "Hiroha", voice: { speaker: 24 }, stroke: "#5E8A3A", x: "85%" },
  suzuno: { name: "鈴乃", engine: "sharevox", component: "Suzuno", voice: { speaker: 25 }, stroke: "#B04A6A", x: "15%" },
  "koharune-ami": { name: "小春音アミ", engine: "style-bert-vits2", component: "KoharuneAmi", voice: { model: "koharune-ami" }, stroke: "#D25C8A", x: "85%" },
  amitaro: { name: "あみたろ", engine: "style-bert-vits2", component: "Amitaro", voice: { model: "amitaro" }, stroke: "#C46A1C", x: "15%" },
} as const satisfies Record<string, CharacterDefinition>;
export type Character = keyof typeof CHARACTERS;
export const CHARACTER_NAMES = Object.keys(CHARACTERS) as Character[];

export const isEngine = (name: string): name is Engine => (ENGINE_NAMES as string[]).includes(name);
export const isCharacter = (name: string): name is Character => (CHARACTER_NAMES as string[]).includes(name);
export const enginesOf = (characters: readonly Character[]): Engine[] => ENGINE_NAMES.filter((e) => characters.some((c) => CHARACTERS[c].engine === e));
