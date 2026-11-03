import { samples } from "@mekuru/audio/wav";
/** @jsxImportSource @mekuru/types */
import { fps, projectRoot, type Anchor, type At, type JSX, type Length, type Node, type Time } from "@mekuru/types";
import type { AudioSource } from "@mekuru/audio";
import { FOLDERS, isMany, readParts, type Folder, type Many, type Part, type Parts } from "./folder.ts";
import { blinks, lipSync, random, type Shot } from "./motion.ts";

export { FOLDERS, type Folder, type Part, type Parts } from "./folder.ts";

export type Face = { [F in Exclude<Folder, Many>]?: string | null } & { [F in Many]?: string | readonly string[] | null };

export interface PortraitOptions<Name extends string = string> {
  src: string;
  x?: Length;
  y?: Length;
  anchor?: Anchor;
  w?: Length;
  h?: Length;
  z?: number;
  face?: Face;
  faces?: Record<Name, Face>;
  blink?: number | false;
  slot?: string;
}

export type FaceOf<Name extends string> = Name | Face;

export interface StandProps<Name extends string> {
  face?: FaceOf<Name>;
  id?: string;
  at?: At;
  len?: Time;
}

export interface TalkProps<Name extends string> {
  face?: FaceOf<Name>;
  source: AudioSource;
}

export interface Portrait<Name extends string = string> {
  readonly parts: Parts;
  readonly faces: readonly Name[];
  Stand(props: StandProps<Name>): JSX.Element;
  Talk(props: TalkProps<Name>): Promise<Awaited<JSX.Element>>;
}

type Chosen = Record<Folder, Part[]>;

export const portrait = <Name extends string = never>(options: PortraitOptions<Name>): Portrait<Name> => {
  const root = projectRoot();
  const parts = readParts(root, options.src);
  const slot = options.slot ?? `portrait:${options.src}`;
  const every = () => (options.blink === false ? 0 : (options.blink ?? Math.round(4 * fps())));
  const place = {
    x: options.x ?? "50%",
    y: options.y ?? "100%",
    anchor: options.anchor ?? ("b" as Anchor),
    w: options.w,
    h: options.h ?? (options.w === undefined ? "80%" : undefined),
    z: options.z,
  };
  const faces = (options.faces ?? {}) as Record<string, Face>;

  const part = (folder: Folder, name: string): Part => {
    const p = parts[folder].get(name);
    if (!p) {
      const names = [...parts[folder].keys()];
      throw new Error(`portrait ${options.src}: ${folder} has no part \`${name}\` (${names.length ? `it has ${names.join(", ")}` : "it is empty"})`);
    }
    return p;
  };
  const choose = (face: Face): Partial<Chosen> => {
    const out: Partial<Chosen> = {};
    for (const folder of FOLDERS) {
      if (!(folder in face)) continue;
      const v = face[folder as keyof Face];
      const names: readonly string[] = v === null || v === undefined ? [] : typeof v === "string" ? [v] : v;
      if (names.length > 1 && !isMany(folder)) throw new Error(`portrait ${options.src}: ${folder} shows one part (${names.join(", ")})`);
      if (names.length > 3) throw new Error(`portrait ${options.src}: ${folder} shows up to three parts (${names.join(", ")})`);
      out[folder] = names.map((n) => part(folder, n));
    }
    return out;
  };
  const first = (folder: Folder): Part[] => {
    if (isMany(folder) || folder === "顔色") return [];
    const all = [...parts[folder].values()];
    const moving = folder === "目" || folder === "口" ? all.find((p) => p.frames.length > 0) : undefined;
    const p = moving ?? all[0];
    return p ? [p] : [];
  };
  const base: Chosen = { ...(Object.fromEntries(FOLDERS.map((f) => [f, first(f)])) as Chosen), ...choose(options.face ?? {}) };
  const named = new Map(Object.entries(faces).map(([name, face]) => [name, choose(face)]));
  const faceOf = (face: FaceOf<Name> | undefined): Chosen => {
    if (face === undefined) return base;
    if (typeof face === "string") {
      const f = named.get(face);
      if (!f)
        throw new Error(
          `portrait ${options.src}: there is no face \`${face}\` (${named.size ? `faces: ${[...named.keys()].join(", ")}` : "no faces are named"})`,
        );
      return { ...base, ...f };
    }
    return { ...base, ...choose(face) };
  };

  const image = (src: string, more: { opacity?: number } = {}) => <image src={src} {...place} {...more} />;
  const seq = (shots: Shot[]) => (
    <seq>
      {shots.map((s) => (
        <dur len={s.len}>{image(s.src)}</dur>
      ))}
    </seq>
  );
  const figure = (c: Chosen, eyes: Node, mouth: Node) => (
    <stack slot={slot}>
      {[...c.後].reverse().map((p) => image(p.src))}
      {c.体.map((p) => image(p.src))}
      {c.顔色.map((p) => image(p.src))}
      {c.髪.map((p) => image(p.src))}
      {mouth}
      {eyes}
      {c.眉.map((p) => image(p.src))}
      {c.髪.filter((p) => p.opacity).map((p) => image(p.src, { opacity: p.opacity }))}
      {[...c.他].reverse().map((p) => image(p.src))}
    </stack>
  );
  const closed = (p: Part) => p.frames[0] ?? p.src;
  const blinking = (p: Part, seed: string) => ({ open: p.src, frames: p.frames, every: every(), fps: fps(), rand: random(seed) });
  const canBlink = (p: Part) => every() > 0 && p.frames.length > 0;

  const Stand = ({ face, len, ...time }: StandProps<Name>): JSX.Element => {
    const c = faceOf(face);
    const eyes = c.目.map((p) => (canBlink(p) ? <repeat>{seq(blinks(blinking(p, `${slot}:${p.src}`)))}</repeat> : image(p.src)));
    const mouth = c.口.map((p) => image(closed(p)));
    const body = figure(c, eyes, mouth);
    return len === undefined ? (
      <stack {...time}>{body}</stack>
    ) : (
      <dur len={len} {...time}>
        {body}
      </dur>
    );
  };

  const Talk = async ({ face, source }: TalkProps<Name>): Promise<Awaited<JSX.Element>> => {
    const c = faceOf(face);
    const wav = source.status === "ready" ? Buffer.from(await Bun.file(source.src).arrayBuffer()) : undefined;
    const len = source.len;
    const seed = `${slot}:${source.label ?? (source.status === "ready" ? source.src : "")}:${len}`;
    const eyes = c.目.map((p) => (canBlink(p) ? seq(blinks(blinking(p, seed), len)) : image(p.src)));
    const mouth = c.口.map((p) => {
      if (!wav || p.frames.length === 0) return image(closed(p));
      return seq(lipSync(samples(wav), [...p.frames, p.src], len, fps()));
    });
    return <dur len={len}>{figure(c, eyes, mouth)}</dur>;
  };

  return { parts, faces: Object.keys(faces) as Name[], Stand, Talk };
};

export { psdPortrait, type PsdPortraitOptions } from "./psd.tsx";
