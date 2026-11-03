/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DrawOp, TextOp } from "@mekuru/protocol";
import { Drawing } from "../src/view/preview/Stage";

const text: TextOp = {
  kind: "text",
  text: "日本語 <script>\n  次の行",
  x: 20,
  y: 30,
  width: 200,
  font: "sans-serif",
  fontSrc: null,
  fontRevision: null,
  size: 32,
  color: "#123456ff",
  bold: true,
  align: "right",
  lineHeight: 1.5,
  stroke: "#ffffffff",
  strokeWidth: 3,
  transform: [1, 0, 0, 1, 10, 20],
};
test("HTML text preserves whitespace, styles and escaped content between SVG runs", () => {
  const path: DrawOp = { kind: "path", d: "M0 0L10 10", color: "#ffffff", stroke: null };
  const html = renderToStaticMarkup(<Drawing ops={[path, path, text, path]} width={1920} height={1080} />);
  expect(html.match(/<svg /g)?.length).toBe(2);
  expect(html.indexOf("</svg>")).toBeLessThan(html.indexOf("日本語"));
  expect(html.lastIndexOf("<svg ")).toBeGreaterThan(html.indexOf("日本語"));
  expect(html).toContain("&lt;script&gt;\n  次の行");
  expect(html).toContain("white-space:pre-wrap");
  expect(html).toContain("text-align:right");
  expect(html).toContain("-webkit-text-stroke:6px #ffffffff");
  expect(html).toContain("matrix(1,0,0,1,10,20)");
});
