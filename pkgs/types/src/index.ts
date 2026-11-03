export { Fragment, jsx, jsx as jsxs, jsx as jsxDEV } from "hono/jsx/jsx-runtime";

export type { FC } from "hono/jsx";
export type { Anchor, At, Color, IntrinsicElements, JSX, Length, Node, Time } from "./jsx.ts";
export { buildValue, isDraft, projectRoot, waitFor } from "./context.ts";
export { writeXml } from "./write.ts";
export { fps, resolveText, toXml, type TextRun } from "./xml.ts";
