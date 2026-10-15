export type Privacy = "private" | "unlisted" | "public";

export interface Settings {
  video?: string;
  title: string;
  description?: string | string[];
  tags?: string[];
  category?: string | number;
  privacy?: Privacy;
  publishAt?: string;
  madeForKids?: boolean;
  thumbnail?: string;
}

export interface VideoResource {
  snippet: { title: string; description: string; tags?: string[]; categoryId: string };
  status: { privacyStatus: Privacy; publishAt?: string; selfDeclaredMadeForKids?: boolean };
}

const KEYS = ["video", "title", "description", "tags", "category", "privacy", "publishAt", "madeForKids", "thumbnail"];
const PRIVACY = ["private", "unlisted", "public"];

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
const descriptionOf = (d: Settings["description"]): string => (Array.isArray(d) ? d.join("\n") : (d ?? "")).trimEnd();

const checkSettings = (value: unknown, name = "youtube.yaml"): Settings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must have the settings (title: …, description: …)`);
  const s = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(s)) if (!KEYS.includes(key)) errors.push(`unknown setting "${key}" (${KEYS.join(", ")})`);
  if (s.video !== undefined && typeof s.video !== "string") errors.push(`"video" must be the path of the video file`);
  if (typeof s.title !== "string" || !s.title.trim()) errors.push(`"title" is required`);
  else if ([...s.title].length > 100) errors.push(`"title" is longer than 100 characters`);
  else if (/[<>]/.test(s.title)) errors.push(`"title" cannot have < or >`);
  if (s.description !== undefined) {
    if (typeof s.description !== "string" && !isStrings(s.description)) errors.push(`"description" must be a string or an array of lines`);
    else {
      const text = descriptionOf(s.description);
      if (Buffer.byteLength(text) > 5000) errors.push(`"description" is longer than 5000 bytes`);
      if (/[<>]/.test(text)) errors.push(`"description" cannot have < or >`);
    }
  }
  if (s.tags !== undefined) {
    if (!isStrings(s.tags)) errors.push(`"tags" must be an array of strings`);
    else if (s.tags.reduce((n, t) => n + [...t].length + (t.includes(" ") ? 2 : 0), Math.max(0, s.tags.length - 1)) > 500)
      errors.push(`"tags" are longer than 500 characters in all`);
  }
  if (s.category !== undefined && !/^\d+$/.test(String(s.category))) errors.push(`"category" must be a category ID (a number such as 27)`);
  if (s.privacy !== undefined && !PRIVACY.includes(s.privacy as string)) errors.push(`"privacy" must be ${PRIVACY.join(", ")}`);
  if (s.publishAt !== undefined) {
    if (typeof s.publishAt !== "string" || Number.isNaN(Date.parse(s.publishAt)))
      errors.push(`"publishAt" must be a date and time (ISO 8601, such as 2026-11-01T18:00:00+09:00)`);
    else if ((s.privacy ?? "private") !== "private") errors.push(`"publishAt" needs "privacy": "private" (the video is private until then)`);
  }
  if (s.madeForKids !== undefined && typeof s.madeForKids !== "boolean") errors.push(`"madeForKids" must be true or false`);
  if (s.thumbnail !== undefined && typeof s.thumbnail !== "string") errors.push(`"thumbnail" must be the path of an image`);
  if (errors.length) throw new Error(`${name}:\n  ${errors.join("\n  ")}`);
  return s as unknown as Settings;
};

export const readSettings = async (file: string): Promise<Settings> => {
  if (!(await Bun.file(file).exists())) throw new Error(`no ${file} (the video, its title, description, ... to upload)`);
  let value: unknown;
  try {
    value = Bun.YAML.parse(await Bun.file(file).text());
  } catch (e) {
    throw new Error(`cannot read ${file}: ${(e as Error).message}`);
  }
  return checkSettings(value, file);
};

export const videoResource = (s: Settings): VideoResource => ({
  snippet: { title: s.title, description: descriptionOf(s.description), tags: s.tags, categoryId: String(s.category ?? 22) },
  status: { privacyStatus: s.privacy ?? "private", publishAt: s.publishAt, selfDeclaredMadeForKids: s.madeForKids },
});
