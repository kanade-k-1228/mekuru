import { descriptionOf, isStrings, type Settings, type Site } from "../common.ts";

export type Privacy = "private" | "unlisted" | "public";

export interface YouTubeSettings extends Settings {
  category?: string | number;
  privacy?: Privacy;
  publishAt?: string;
  madeForKids?: boolean;
}

export interface VideoResource {
  snippet: { title: string; description: string; tags?: string[]; categoryId: string };
  status: { privacyStatus: Privacy; publishAt?: string; selfDeclaredMadeForKids?: boolean };
}

const PRIVACY = ["private", "unlisted", "public"];

export const YOUTUBE: Site = {
  config: "configs/youtube.yaml",
  keys: ["video", "title", "description", "tags", "category", "privacy", "publishAt", "madeForKids", "thumbnail"],
  check: (s, errors) => {
    if (typeof s.title === "string") {
      if ([...s.title].length > 100) errors.push(`"title" is longer than 100 characters`);
      else if (/[<>]/.test(s.title)) errors.push(`"title" cannot have < or >`);
    }
    if (typeof s.description === "string" || isStrings(s.description)) {
      const text = descriptionOf(s.description);
      if (Buffer.byteLength(text) > 5000) errors.push(`"description" is longer than 5000 bytes`);
      if (/[<>]/.test(text)) errors.push(`"description" cannot have < or >`);
    }
    if (isStrings(s.tags) && s.tags.reduce((n, t) => n + [...t].length + (t.includes(" ") ? 2 : 0), Math.max(0, s.tags.length - 1)) > 500)
      errors.push(`"tags" are longer than 500 characters in all`);
    if (s.category !== undefined && !/^\d+$/.test(String(s.category))) errors.push(`"category" must be a category ID (a number such as 27)`);
    if (s.privacy !== undefined && !PRIVACY.includes(s.privacy as string)) errors.push(`"privacy" must be ${PRIVACY.join(", ")}`);
    if (s.publishAt !== undefined) {
      if (typeof s.publishAt !== "string" || Number.isNaN(Date.parse(s.publishAt)))
        errors.push(`"publishAt" must be a date and time (ISO 8601, such as 2026-11-01T18:00:00+09:00)`);
      else if ((s.privacy ?? "private") !== "private") errors.push(`"publishAt" needs "privacy": "private" (the video is private until then)`);
    }
    if (s.madeForKids !== undefined && typeof s.madeForKids !== "boolean") errors.push(`"madeForKids" must be true or false`);
  },
};

export const videoResource = (s: YouTubeSettings): VideoResource => ({
  snippet: { title: s.title, description: descriptionOf(s.description), tags: s.tags, categoryId: String(s.category ?? 22) },
  status: { privacyStatus: s.privacy ?? "private", publishAt: s.publishAt, selfDeclaredMadeForKids: s.madeForKids },
});
