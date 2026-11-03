/** @jsxImportSource @mekuru/types */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectRoot, type At, type Time } from "@mekuru/types";
import type { AudioSource } from "@mekuru/audio";
import type { PortraitOptions } from "./index.tsx";
import { validateManifest } from "./psd-schema.ts";

export type PsdPortraitOptions = Omit<PortraitOptions, "face" | "faces" | "blink">;
export function psdPortrait<Props extends object>(options: PsdPortraitOptions) {
  const manifest: unknown = JSON.parse(readFileSync(resolve(projectRoot(), options.src, "portrait.json"), "utf8"));
  validateManifest(manifest);
  const { src, slot = `portrait:${src}`, ...placement } = options;
  const place: Omit<PsdPortraitOptions, "src"> = { x: "50%", y: "100%", anchor: "b" as const, h: options.w === undefined ? "80%" : undefined, ...placement };
  const figure = (props: Props) => {
    const values = props as Record<string, unknown>;
    for (const name of Object.keys(values)) {
      if (!manifest.layers.some((l) => l.kind !== "fixed" && l.name === name)) throw new Error(`Unknown PSD property: ${name}`);
    }
    return (
      <stack slot={slot}>
        {manifest.layers.map((layer) => {
          const value = layer.kind === "fixed" || values[layer.name] === undefined ? layer.initial : values[layer.name];
          if (layer.kind !== "select" && typeof value !== "boolean") throw new Error(`PSD ${layer.name}: expected boolean`);
          if (layer.kind === "select" && value !== null && (typeof value !== "string" || !layer.options.some((o) => o.name === value)))
            throw new Error(`PSD ${layer.name}: unknown option ${String(value)}`);
          if (value === false || value === null) return null;
          const part = layer.kind === "select" ? layer.options.find((o) => o.name === value) : layer.options[0];
          if (!part) throw new Error(`Missing PSD option: ${layer.name}`);
          return <image src={`${src.replace(/\/$/, "")}/${part.src}`} {...place} />;
        })}
      </stack>
    );
  };
  const Stand = ({ id, at, len, ...props }: Props & { id?: string; at?: At; len?: Time }) => {
    const body = figure(props as Props);
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
  const Talk = ({ source, ...props }: Props & { source: AudioSource }) => <dur len={source.len}>{figure(props as Props)}</dur>;
  return { Stand, Talk };
}
