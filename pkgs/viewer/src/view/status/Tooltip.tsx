import type { ReactNode } from "react";
import { clsx } from "clsx";

export const Tooltip = ({ label, keys, align = "center", children }: { label: string; keys?: string; align?: "center" | "end"; children: ReactNode }) => {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={clsx(
          "pointer-events-none absolute bottom-full z-20 mb-2 flex items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2 py-1 text-[11.5px] whitespace-nowrap text-fg opacity-0 shadow-lg shadow-black/40 transition-opacity group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 group-hover/tip:delay-300",
          align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
        )}
      >
        {label}
        {keys && <kbd className="rounded border border-line-strong bg-hover px-1 font-mono text-[10.5px] text-dim">{keys}</kbd>}
      </span>
    </span>
  );
};
