/** @jsxImportSource @mekuru/tsx */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fps, projectRoot, type At, type AudioSource, type IntrinsicElements, type Time } from "@mekuru/tsx";
import { samples } from "@mekuru/tsx/wav";
import { blinks } from "./blink.ts";
import { lipSync } from "./lips.ts";
import { random, type Shot } from "./shots.ts";
import { selectable, validateManifest } from "./psd-schema.ts";

export interface PortraitOptions extends Pick<IntrinsicElements["image"], "x" | "y" | "anchor" | "w" | "h" | "z" | "rotate"> {
  src: string;
  slot?: string;
  blink?: number | false;
}

/** One runtime for native PSD assets and converted portraits alike. */
export function portrait<Props extends object>(options: PortraitOptions) {
  const root = projectRoot();
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(resolve(root, options.src, "portrait.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Missing portrait.json: export a Mekuru PSD with mekuru-psd --out ${options.src}`);
    throw error;
  }
  validateManifest(manifest);
  const { layers } = manifest;
  const { src, slot = `portrait:${src}`, blink, ...placement } = options;
  if (blink !== undefined && blink !== false && (!Number.isSafeInteger(blink) || blink < 0))
    throw new Error("blink must be a non-negative whole number of frames or false");
  const place: Omit<PortraitOptions, "src"> = { x: "50%", y: "100%", anchor: "b" as const, h: options.w === undefined ? "80%" : undefined, ...placement };
  const image = (path: string) => <image src={`${src.replace(/\/$/, "")}/${path}`} {...place} />;
  const sequence = (shots: Shot[]) => (
    <seq>
      {shots.map((s) => (
        <dur len={s.len}>{image(s.src)}</dur>
      ))}
    </seq>
  );
  const choose = (props: Props) => {
    const values = props as Record<string, unknown>;
    for (const name of Object.keys(values)) {
      if (!layers.some((l) => l.kind !== "fixed" && l.name === name)) throw new Error(`Unknown PSD property: ${name}`);
    }
    return layers.flatMap((layer) => {
      const value = layer.kind === "fixed" || !Object.hasOwn(values, layer.name) || values[layer.name] === undefined ? layer.initial : values[layer.name];
      if (!selectable(layer.kind) && typeof value !== "boolean") throw new Error(`PSD ${layer.name}: expected boolean`);
      if (selectable(layer.kind) && value !== null && (typeof value !== "string" || !layer.options.some((o) => o.name === value)))
        throw new Error(`PSD ${layer.name}: unknown option ${String(value)}`);
      if (value === false || value === null) return [];
      const part = selectable(layer.kind) ? layer.options.find((o) => o.name === value) : layer.options[0];
      if (!part) throw new Error(`Missing PSD option: ${layer.name}`);
      return [{ kind: layer.kind, frames: part.frames }];
    });
  };
  const figure = (chosen: ReturnType<typeof choose>, len?: number, audio?: ReturnType<typeof samples>, seed = "stand") => (
    <stack slot={slot}>
      {chosen.map(({ kind, frames }) => {
        const closed = frames[0];
        const open = frames[frames.length - 1];
        if (kind === "blink" && frames.length > 1) {
          const every = blink === false ? 0 : (blink ?? Math.round(4 * fps()));
          if (every > 0) {
            const shots = sequence(blinks({ open, frames: frames.slice(0, -1), every, fps: fps(), rand: random(`${slot}:${closed}:${seed}`) }, len));
            return len === undefined ? <repeat>{shots}</repeat> : shots;
          }
          return image(open);
        }
        if (kind === "lip" && frames.length > 1 && audio && len !== undefined) return sequence(lipSync(audio, frames, len, fps()));
        return image(closed);
      })}
    </stack>
  );
  const Stand = ({ id, at, len, ...props }: Props & { id?: string; at?: At; len?: Time }) => {
    const body = figure(choose(props as Props), len);
    return len === undefined ? (
      <stack id={id} at={at}>
        {body}
      </stack>
    ) : (
      <dur id={id} at={at} len={len}>
        {body}
      </dur>
    );
  };
  const Talk = async ({ source, ...props }: Props & { source: AudioSource }) => {
    const chosen = choose(props as Props);
    const audio =
      source.status === "ready" && chosen.some((c) => c.kind === "lip" && c.frames.length > 1)
        ? samples(Buffer.from(await Bun.file(resolve(root, source.src)).arrayBuffer()))
        : undefined;
    const seed = `${source.label ?? (source.status === "ready" ? source.src : "")}:${source.len}`;
    return <dur len={source.len}>{figure(chosen, source.len, audio, seed)}</dur>;
  };
  return { Stand, Talk };
}
