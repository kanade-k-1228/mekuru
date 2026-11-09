type Value = JsxNode | string | number | bigint | boolean | null | undefined | Node[];
export type Node = Value | Promise<Value>;
export type FC<P = Record<string, unknown>> = {
  (props: P): Node;
  defaultProps?: Partial<P>;
  displayName?: string;
};

export interface JsxNode {
  tag: string | ((props: never) => Node);
  props: Record<string, unknown>;
  children: Node[];
  key?: string | number | bigint | null;
}

export const Fragment = ({ children }: { children?: Node }): Node => children;

export const jsx = (tag: JsxNode["tag"], props: Record<string, unknown> | null, key?: JsxNode["key"]): JsxNode => {
  const children = props?.children as Node;
  return { tag, props: props ?? {}, children: Array.isArray(children) ? children : children === undefined ? [] : [children], key };
};
