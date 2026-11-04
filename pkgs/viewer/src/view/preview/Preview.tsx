/** @jsxImportSource react */
import { atom, useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import type { DrawOp, SceneElement, TextOp } from "../../protocol";
import { resourcesAtom } from "../../logic/server";
import { stageAtom, type Shown } from "../../logic/stage";
import { observeSize } from "../../logic/util";

import { attachTextFont, fileUrl, fallbackFont } from "../../logic/fonts";

const Vector = ({ ops }: { ops: Exclude<DrawOp, TextOp>[] }) => (
  <>
    {ops.map((op, i) => {
      if (op.kind === "image") {
        const [x, y, width, height] = op.bounds;
        return (
          <image
            key={i}
            href={fileUrl(op.src, op.revision)}
            x={x}
            y={y}
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            transform={op.transform ? `matrix(${op.transform.join(" ")})` : undefined}
          />
        );
      }
      const stroke = op.stroke;
      return (
        <path
          key={i}
          d={op.d}
          fill={stroke ? "none" : op.color}
          stroke={stroke ? op.color : undefined}
          strokeWidth={stroke?.width}
          strokeLinecap={stroke?.lineCap}
          strokeLinejoin={stroke?.lineJoin}
          strokeDasharray={stroke?.dash.length ? stroke.dash.join(" ") : undefined}
        />
      );
    })}
  </>
);

const Text = ({ op }: { op: TextOp }) => {
  const { font, fontSrc, fontRevision } = op;
  const ref = useCallback((el: HTMLDivElement | null) => (el ? attachTextFont(el, { font, fontSrc, fontRevision }) : undefined), [font, fontSrc, fontRevision]);
  return (
    <div style={{ position: "absolute", inset: 0, transform: op.transform ? `matrix(${op.transform.join(",")})` : undefined, transformOrigin: "0 0" }}>
      <div
        ref={ref}
        lang={op.lang}
        style={{
          position: "absolute",
          left: op.x,
          top: op.y,
          width: op.width ?? "max-content",
          fontFamily: fallbackFont(op.font),
          fontSize: op.size,
          fontWeight: op.bold ? 700 : 400,
          fontStyle: "normal",
          letterSpacing: "normal",
          lineHeight: op.lineHeight,
          textAlign: op.align,
          color: op.color,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          WebkitTextStroke: op.stroke ? `${Math.max(0, op.strokeWidth) * 2}px ${op.stroke}` : undefined,
          paintOrder: "stroke fill",
        }}
      >
        {op.text}
      </div>
    </div>
  );
};

type Part = { key: number; text: TextOp } | { key: number; ops: Exclude<DrawOp, TextOp>[] };
export const Drawing = memo(({ ops, width, height }: { ops: DrawOp[]; width: number; height: number }) => {
  const parts = useMemo(() => {
    const result: Part[] = [];
    ops.forEach((op, key) => {
      if (op.kind === "text") result.push({ key, text: op });
      else {
        const last = result.at(-1);
        if (last && "ops" in last) last.ops.push(op);
        else result.push({ key, ops: [op] });
      }
    });
    return result;
  }, [ops]);
  return (
    <>
      {parts.map((part) =>
        "text" in part ? (
          <Text key={part.key} op={part.text} />
        ) : (
          <svg key={part.key} width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            <Vector ops={part.ops} />
          </svg>
        ),
      )}
    </>
  );
});

const Resource = ({ id, width, height }: { id: string; width: number; height: number }) => {
  const resource = useMemo(() => atom((get) => get(resourcesAtom)[id]), [id]);
  const ops = useAtomValue(resource);
  return <Drawing ops={ops} width={width} height={height} />;
};

const Layer = memo(({ element, opacity, width, height }: { element: SceneElement; opacity: number; width: number; height: number }) => {
  const counts = new Map<string, number>();
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      {element.drawings.map((id) => {
        const occurrence = counts.get(id) ?? 0;
        counts.set(id, occurrence + 1);
        return <Resource key={`${id}:${occurrence}`} id={id} width={width} height={height} />;
      })}
    </div>
  );
});

const Media = ({ element, state, opacity }: { element: SceneElement; state: NonNullable<Shown["media"]>; opacity: number }) => {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const media = element.media;
  const { position, play, rate, volume } = state;
  const sync = () => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume;
    if (play) el.playbackRate = Math.min(16, Math.max(1 / 16, rate));
    if (el.readyState > 0 && Math.abs(el.currentTime - position) > (play ? 0.15 * Math.max(1, rate) : 0.01)) el.currentTime = position;
    if (play && el.paused) void el.play().catch(() => {});
    else if (!play && !el.paused) el.pause();
  };
  useEffect(sync, [position, play, rate, volume]);
  useEffect(() => {
    const el = ref.current;
    return () => {
      el?.pause();
    };
  }, []);
  if (!media) return null;
  const [left, top, width, height] = element.bounds ?? [0, 0, 0, 0];
  const style: CSSProperties = { position: "absolute", left, top, width, height, opacity, objectFit: "contain" };
  return element.kind === "video" ? (
    <video ref={ref as Ref<HTMLVideoElement>} src={fileUrl(media.src, media.revision)} style={style} onLoadedMetadata={sync} playsInline preload="auto" />
  ) : (
    <audio ref={ref as Ref<HTMLAudioElement>} src={fileUrl(media.src, media.revision)} onLoadedMetadata={sync} preload="auto" />
  );
};

/** The scene at the playhead, scaled to fit its box. */
export const Preview = ({ width, height }: { width: number; height: number }) => {
  const shown = useAtomValue(stageAtom);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const attach = useCallback((el: HTMLElement | null) => (el ? observeSize(el, setBox) : undefined), []);
  const scale = box ? Math.min(box.width / width, box.height / height) : 0.25;
  return (
    <section ref={attach} className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-black" aria-label="Preview">
      <div style={{ width: width * scale, height: height * scale }}>
        <div style={{ position: "relative", width, height, overflow: "hidden", transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          {shown.map(({ element, opacity, media }) =>
            media ? (
              <Media key={element.key} element={element} state={media} opacity={opacity} />
            ) : (
              <Layer key={element.key} element={element} opacity={opacity} width={width} height={height} />
            ),
          )}
        </div>
      </div>
    </section>
  );
};
