import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

export interface Settings {
  video?: string;
  title: string;
  description?: string | string[];
  tags?: string[];
  thumbnail?: string;
}

const KEYS = ["video", "title", "description", "tags", "thumbnail"];

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

const checkSettings = (value: unknown, name = "niconico.yaml"): Settings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must have the settings (title: …, description: …)`);
  const s = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(s)) if (!KEYS.includes(key)) errors.push(`unknown setting "${key}" (${KEYS.join(", ")})`);
  if (s.video !== undefined && typeof s.video !== "string") errors.push(`"video" must be the path of the video file`);
  if (typeof s.title !== "string" || !s.title.trim()) errors.push(`"title" is required`);
  if (s.description !== undefined && typeof s.description !== "string" && !isStrings(s.description))
    errors.push(`"description" must be a string or an array of lines`);
  if (s.tags !== undefined && !isStrings(s.tags)) errors.push(`"tags" must be an array of strings`);
  if (s.thumbnail !== undefined && typeof s.thumbnail !== "string") errors.push(`"thumbnail" must be the path of an image`);
  if (errors.length) throw new Error(`${name}:\n  ${errors.join("\n  ")}`);
  return s as unknown as Settings;
};

export const readSettings = (file: string): Settings => {
  if (!existsSync(file)) throw new Error(`no ${file} (the video, its title, description and tags to post)`);
  let value: unknown;
  try {
    value = parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read ${file}: ${(e as Error).message}`);
  }
  return checkSettings(value, file);
};

export const descriptionOf = (s: Settings): string => (Array.isArray(s.description) ? s.description.join("\n") : (s.description ?? "")).trimEnd();

export const sheet = (s: Settings, file: string, thumbnail?: string): string =>
  [
    `video: ${file}`,
    ...(thumbnail ? [`thumbnail: ${thumbnail}`] : []),
    `title: ${s.title}`,
    `tags:  ${(s.tags ?? []).join(" ")}`,
    "description:",
    descriptionOf(s),
  ].join("\n");
