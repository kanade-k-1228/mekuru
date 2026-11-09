import { expect, test } from "bun:test";
import { fps, resolveText, toXml, type FC, type Node } from "@mekuru/tsx";
import { Fragment, jsx, jsxs } from "@mekuru/tsx/jsx-runtime";
import { jsxDEV } from "@mekuru/tsx/jsx-dev-runtime";

test("both JSX entrypoints preserve children and keys without evaluating components or mutating props", async () => {
  let calls = 0;
  const Group: FC<{ children?: Node }> = ({ children }) => {
    calls++;
    return <dur len={fps()}>{children}</dur>;
  };
  const props = Object.freeze({ children: jsx("text", { text: "caption" }) });
  for (const make of [jsx, jsxs, jsxDEV]) {
    const node = make(Group, props, "group");
    const before = calls;
    expect(node.key).toBe("group");
    expect(await toXml(jsx("mekuru", { fps: 24, children: node }))).toBe(
      '<mekuru fps="24">\n  <seq>\n    <dur len="24">\n      <text text="caption"/>\n    </dur>\n  </seq>\n</mekuru>\n',
    );
    expect(calls).toBe(before + 1);
    expect(Object.keys(props)).toEqual(["children"]);
  }
});

test("fragments and async components expand nested arrays, promises and optional children", async () => {
  const Words: FC<{ children?: Node }> = async ({ children }) => ["hello", children];
  expect(
    await resolveText(
      <Fragment>
        <Words>{Promise.resolve([" ", 42])}</Words>
        {false}
        {null}
        {undefined}
        {[<Fragment key="nested">!</Fragment>]}
      </Fragment>,
    ),
  ).toBe("hello 42!");
  expect(await resolveText(<Fragment />)).toBe("");
});
