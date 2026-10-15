import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { promisify } from "node:util";

export const httpClient =
  (url: string, name: string, help: string) =>
  async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(url + path, { ...init, signal: AbortSignal.timeout(300_000) }).catch((e: unknown) => {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(`${name} is not reachable at ${url} (${reason}).\n${help}`);
    });
    if (!res.ok) throw new Error(`${name} ${path.split("?")[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res;
  };

export const limit = (concurrency: number) => {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be a positive integer");
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (running < concurrency) running++;
    else await new Promise<void>((go) => waiting.push(go));
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
};

const run = promisify(execFile);
const isWsl = !!process.env.WSL_INTEROP || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop");
const toWindows = async (path: string): Promise<string> => (isWsl ? (await run("wslpath", ["-w", path])).stdout.trim() : path);
const windowsTemp = async (): Promise<string> => {
  const temp = (await run("cmd.exe", ["/d", "/c", "echo %TEMP%"], { cwd: "/mnt/c" })).stdout.trim();
  if (!temp || temp.includes("%")) throw new Error("could not find the Windows TEMP folder");
  return (await run("wslpath", ["-u", temp])).stdout.trim();
};

const powershell = (name: string, args: string[], timeout: number): Promise<string | undefined> =>
  new Promise((done) => {
    const child = spawn("powershell.exe", args, { cwd: isWsl ? "/mnt/c" : undefined, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let failure: string | undefined;
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      failure = `${name} timed out after ${timeout / 1000}s`;
      child.kill();
    }, timeout);
    child.on("error", (e) => {
      failure = `failed to start powershell.exe (${name} needs Windows, or WSL with Windows interop): ${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done(failure ?? (code === 0 ? undefined : `exit code ${code}\n${stderr.trim().split("\n").slice(-20).join("\n")}`));
    });
  });

interface Job<P> {
  voice: P;
  text: string;
  out: string;
  done(): void;
  fail(error: unknown): void;
}
interface Report {
  id: number;
  ok: boolean;
  error?: string;
}
interface Result {
  fatal?: string;
  jobs?: Report | Report[];
}

export interface WindowsEngine<P> {
  id: string;
  name: string;
  product: string;
  component: string;
  script: URL;
  timeout(count: number): number;
  jobEntry(id: number, text: string, out: string, voice: P): Record<string, unknown>;
  validateWav?(path: string): Promise<void>;
}

export const windowsEngine = <P>(engine: WindowsEngine<P>) => {
  const installations = new Map<string, { say(voice: P, text: string, out: string): Promise<void> }>();
  return (dllDir: string | undefined, stageDir: string | undefined) => {
    const key = JSON.stringify([dllDir, stageDir]);
    const found = installations.get(key);
    if (found) return found;
    const serial = limit(1);
    const queue: Job<P>[] = [];
    let timer: ReturnType<typeof setTimeout>;
    const synthesize = async (jobs: Job<P>[]) => {
      try {
        if (process.platform !== "win32" && !isWsl) throw new Error(`${engine.product} runs only on Windows (or from WSL)`);
        const root = stageDir ?? join(isWsl ? await windowsTemp() : tmpdir(), `mekuru-${engine.id}`);
        await mkdir(root, { recursive: true });
        const stage = await mkdtemp(join(root, `${process.pid}-`));
        try {
          const windowsStage = await toWindows(stage);
          const forWindows = (name: string) => win32.join(windowsStage, name);
          const manifest = {
            dll_dir: dllDir ?? null,
            result: forWindows("result.json"),
            jobs: jobs.map((job, i) => engine.jobEntry(i, job.text, forWindows(`${i}.wav`), job.voice)),
          };
          const script = `${engine.id}.ps1`;
          await copyFile(engine.script, join(stage, script));
          await writeFile(join(stage, "jobs.json"), JSON.stringify(manifest));
          const args = [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            forWindows(script),
            "-Manifest",
            forWindows("jobs.json"),
          ];
          const failure = await powershell(engine.name, args, engine.timeout(jobs.length));
          const result = await readFile(join(stage, "result.json"), "utf8").then(
            (text) => JSON.parse(text.replace(/^\uFEFF/, "")) as Result,
            () => undefined,
          );
          if (!result) throw new Error(`the ${engine.name} script failed${failure ? `: ${failure}` : ""}`);
          if (result.fatal)
            throw new Error(
              `${engine.product} is not available: ${result.fatal}\n  (install ${engine.product}, or set \`dll-dir\` on \`<${engine.component}>\`)`,
            );
          const reports = [result.jobs ?? []].flat();
          for (const [i, job] of jobs.entries()) {
            try {
              const report = reports.find((r) => r.id === i);
              if (!report?.ok) throw new Error(`${engine.name}: ${report?.error ?? "no audio was produced"}`);
              const wav = join(stage, `${i}.wav`);
              if (engine.validateWav) await engine.validateWav(wav);
              else if (!existsSync(wav)) throw new Error(`${engine.name}: no audio was produced`);
              await copyFile(wav, job.out);
              job.done();
            } catch (e) {
              job.fail(e);
            }
          }
        } finally {
          await rm(stage, { recursive: true, force: true });
        }
      } catch (e) {
        for (const job of jobs) job.fail(e);
      }
    };
    const installation = {
      say: (voice: P, text: string, out: string): Promise<void> =>
        new Promise((done, fail) => {
          queue.push({ voice, text, out, done, fail });
          clearTimeout(timer);
          timer = setTimeout(() => {
            const jobs = queue.splice(0);
            void serial(() => synthesize(jobs));
          }, 50);
        }),
    };
    installations.set(key, installation);
    return installation;
  };
};
