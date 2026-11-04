import { Command } from "commander";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const VERSION: string = (await Bun.file(new URL("../package.json", import.meta.url)).json()).version;

export const configDir = (): string => {
  if (process.env.MEKURU_CONFIG_DIR) return process.env.MEKURU_CONFIG_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mekuru");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "mekuru");
};

/** The settings every site takes. */
export interface Settings {
  video?: string;
  title: string;
  description?: string | string[];
  tags?: string[];
  thumbnail?: string;
}

export interface Site {
  /** the YAML file without arguments */
  config: string;
  /** what the YAML file gives, for the error when there is none */
  what: string;
  keys: string[];
  /** adds what is wrong with the settings only this site takes or limits */
  check?: (s: Record<string, unknown>, errors: string[]) => void;
}

export const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
export const descriptionOf = (d: Settings["description"]): string => (Array.isArray(d) ? d.join("\n") : (d ?? "")).trimEnd();

const checkSettings = <S extends Settings>(value: unknown, name: string, site: Site): S => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must have the settings (title: …, description: …)`);
  const s = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(s)) if (!site.keys.includes(key)) errors.push(`unknown setting "${key}" (${site.keys.join(", ")})`);
  if (s.video !== undefined && typeof s.video !== "string") errors.push(`"video" must be the path of the video file`);
  if (typeof s.title !== "string" || !s.title.trim()) errors.push(`"title" is required`);
  if (s.description !== undefined && typeof s.description !== "string" && !isStrings(s.description))
    errors.push(`"description" must be a string or an array of lines`);
  if (s.tags !== undefined && !isStrings(s.tags)) errors.push(`"tags" must be an array of strings`);
  if (s.thumbnail !== undefined && typeof s.thumbnail !== "string") errors.push(`"thumbnail" must be the path of an image`);
  site.check?.(s, errors);
  if (errors.length) throw new Error(`${name}:\n  ${errors.join("\n  ")}`);
  return s as unknown as S;
};

export const readSettings = async <S extends Settings>(file: string, site: Site): Promise<S> => {
  if (!(await Bun.file(file).exists())) throw new Error(`no ${file} (${site.what})`);
  let value: unknown;
  try {
    value = Bun.YAML.parse(await Bun.file(file).text());
  } catch (e) {
    throw new Error(`cannot read ${file}: ${(e as Error).message}`);
  }
  return checkSettings(value, file, site);
};

export interface Upload<S extends Settings> {
  config: string;
  settings: S;
  file: string;
  thumbnail?: string;
}

export const readUploads = <S extends Settings>(configs: string[], site: Site): Promise<Upload<S>[]> =>
  Promise.all(
    (configs.length ? configs : [site.config]).map(async (config) => {
      const settings = await readSettings<S>(config, site);
      const file = resolve(settings.video ?? "video.mp4");
      const thumbnail = settings.thumbnail === undefined ? undefined : resolve(settings.thumbnail);
      for (const f of [file, thumbnail]) if (f && !(await Bun.file(f).exists())) throw new Error(`${f} does not exist (in ${config})`);
      return { config, settings, file, thumbnail };
    }),
  );

export const command = (name: string, site: Site, description: string): Command =>
  new Command(name)
    .description(description)
    .version(VERSION)
    .argument("[config...]", `the YAML files of the settings (default: ${site.config})`)
    .showHelpAfterError("(add --help for more information)");

export const run = (program: Command): void => {
  program.parseAsync().catch((e: Error) => {
    console.error(`error: ${e.message}`);
    process.exit(1);
  });
};
