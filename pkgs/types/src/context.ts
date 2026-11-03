import { AsyncLocalStorage } from "node:async_hooks";

export interface BuildContext {
  root: string;
  draft: boolean;
  waits: Set<Promise<unknown>>;
  values: Map<symbol, unknown>;
}

export const builds = new AsyncLocalStorage<BuildContext>();

export const context = (draft = false): BuildContext => ({ root: process.cwd(), draft, waits: new Set(), values: new Map() });

export const projectRoot = (): string => builds.getStore()?.root ?? process.cwd();
export const isDraft = (): boolean => builds.getStore()?.draft ?? false;

export const waitFor = (work: Promise<unknown>): void => {
  work.catch(() => {});
  builds.getStore()?.waits.add(work);
};

/** Share a value within one build, including its draft and final passes. */
export const buildValue = <T>(key: symbol, create: () => T): T => {
  const values = builds.getStore()?.values;
  if (!values) throw new Error("buildValue() is available while toXml or writeXml expands a video");
  if (!values.has(key)) values.set(key, create());
  return values.get(key) as T;
};
