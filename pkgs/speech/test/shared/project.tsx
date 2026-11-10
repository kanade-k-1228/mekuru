/** @jsxImportSource @mekuru/tsx */
import { afterEach, beforeEach, mock, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toXml, type Node } from "@mekuru/tsx";

export const say = (line: Node) => toXml(<mekuru>{line}</mekuru>);
export const mockFetch = (fn: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) =>
  spyOn(globalThis, "fetch").mockImplementation(fn as typeof fetch);

const URLS = ["MEKURU_IRODORU_URL", "MEKURU_VOICEVOX_URL"];
/** Runs each test of the calling file in a new project folder, with the engines' URL variables unset and mocks restored after. */
export const tempProject = () => {
  const project = { dir: "" };
  let cwd = "";
  let env: (string | undefined)[] = [];
  beforeEach(async () => {
    cwd = process.cwd();
    env = URLS.map((key) => process.env[key]);
    for (const key of URLS) delete process.env[key];
    project.dir = await mkdtemp(join(tmpdir(), "mekuru-speech-"));
    process.chdir(project.dir);
  });
  afterEach(async () => {
    mock.restore();
    process.chdir(cwd);
    URLS.forEach((key, index) => {
      if (env[index] === undefined) delete process.env[key];
      else process.env[key] = env[index];
    });
    await rm(project.dir, { recursive: true, force: true });
  });
  return project;
};
