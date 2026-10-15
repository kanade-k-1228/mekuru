import { useAtomValue } from "jotai";
import { RefreshCw } from "lucide-react";
import type { StateDto } from "@mekuru/cli/protocol";
import { keysAtom } from "../logic/playback/atoms";
import { connAtom, serverAtom } from "../logic/server";
import { PREVIEW_MIN_HEIGHT, TIMELINE_MIN_HEIGHT, timelineHeightAtom } from "../logic/timeline/atoms";
import { Preview } from "./preview/Preview";
import { ResizeHandle } from "./timeline/ResizeHandle";
import { StatusBar } from "./status/StatusBar";
import { Timeline } from "./timeline/Timeline";

export const App = () => {
  const server = useAtomValue(serverAtom);
  return server ? <Workspace server={server} /> : <Connecting />;
};

const Connecting = () => {
  const conn = useAtomValue(connAtom);
  return (
    <div className="grid h-dvh place-items-center">
      <div className="mx-4 space-y-3 rounded-xl border border-line bg-panel px-10 py-8 text-center">
        <div className="text-[22px] font-bold tracking-wider text-accent-strong">Mekuru Movie Maker</div>
        <p>{conn === "reconnecting" ? "Reconnecting to the server…" : "Connecting to the server…"}</p>
        <p className="text-dim">
          Make sure that <code>bun preview</code> is running.
        </p>
      </div>
    </div>
  );
};

const Workspace = ({ server }: { server: StateDto }) => {
  useAtomValue(keysAtom);
  const timelineHeight = useAtomValue(timelineHeightAtom);
  const sched = server.preview;
  const errors = server.error ? [{ title: "Error in the script (showing the last version that worked)", text: server.error }] : [];

  const rows = `minmax(${PREVIEW_MIN_HEIGHT}px,1fr) minmax(${TIMELINE_MIN_HEIGHT}px,${timelineHeight}px) auto`;

  return (
    <div className="grid h-dvh grid-cols-[minmax(0,1fr)]" style={{ gridTemplateRows: rows }}>
      <main className="flex min-h-0 flex-col">
        {errors.map((e) => (
          <div
            key={e.title}
            className="max-h-[40%] flex-none overflow-auto border-b border-line bg-error/13 px-3 py-2 text-[12.5px] text-error-fg"
            role="alert"
          >
            <div className="mb-1 font-semibold">{e.title}</div>
            <pre className="font-mono whitespace-pre-wrap wrap-break-word">{e.text}</pre>
          </div>
        ))}
        {server.diagnostics
          .filter((d) => d.severity === "warning")
          .map((d, i) => (
            <p key={i} className="px-3 text-xs text-warning">
              L{d.line}: {d.message}
            </p>
          ))}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {sched && <Preview schedule={sched} />}
          {server.status === "building" && <Reloading />}
        </div>
      </main>
      <div className="relative min-h-0">
        <ResizeHandle />
        {sched ? <Timeline /> : <div className="h-full border-t border-line bg-source" />}
      </div>
      <StatusBar />
    </div>
  );
};

const Reloading = () => (
  <div role="status" className="pointer-events-none absolute inset-0 grid animate-fade-in place-items-center overflow-hidden bg-black/60">
    <RefreshCw className="size-10 text-fg motion-safe:animate-spin" aria-hidden />
    <span className="sr-only">Updating the preview</span>
  </div>
);
