import { useAtomValue } from "jotai";
import { memo, useEffect, useRef, type CSSProperties, type Ref } from "react";
import type { DrawOp, SceneElement } from "@mekuru/cli/protocol";
import { stageAtom, type Shown } from "../../logic/stage";

const fileUrl = (src: string) => `/files/${src.split("/").map(encodeURIComponent).join("/")}`;

const Drawing = memo(({ ops }: { ops: DrawOp[] }) => (
  <>
    {ops.map((op, i) => {
      if (op.kind === "image") {
        const [x, y, width, height] = op.bounds;
        return (
          <image
            key={i}
            href={fileUrl(op.src)}
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
));

const Layer = memo(({ element, opacity, width, height }: { element: SceneElement; opacity: number; width: number; height: number }) => (
  <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity, overflow: "visible" }}>
    <Drawing ops={element.ops} />
  </svg>
));

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
    <video ref={ref as Ref<HTMLVideoElement>} src={fileUrl(media.src)} style={style} onLoadedMetadata={sync} playsInline preload="auto" />
  ) : (
    <audio ref={ref as Ref<HTMLAudioElement>} src={fileUrl(media.src)} onLoadedMetadata={sync} preload="auto" />
  );
};

export const Stage = ({ width, height }: { width: number; height: number }) => {
  const shown = useAtomValue(stageAtom);
  return (
    <div style={{ position: "relative", width, height, background: "black", overflow: "hidden" }}>
      {shown.map(({ element, opacity, media }) =>
        media ? (
          <Media key={element.id} element={element} state={media} opacity={opacity} />
        ) : (
          <Layer key={element.id} element={element} opacity={opacity} width={width} height={height} />
        ),
      )}
    </div>
  );
};
