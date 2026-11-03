/** Test/benchmark harness only: all serving and compilation runs in the native binary. */
import { findCompiler } from "../../pkgs/compiler/npm/compiler.js";

export async function startServer(opts: {
  xml: string;
  port: number;
  root?: string;
  run?: string;
  title?: string;
  compiler?: string;
  env?: Record<string, string>;
}) {
  const args = [opts.compiler ?? findCompiler(), opts.xml, "--serve", "--no-open", "--port", String(opts.port)];
  for (const key of ["root", "run", "title"] as const) if (opts[key]) args.push(`--${key}`, opts[key]);
  const process = Bun.spawn(args, { stdout: "ignore", stderr: "pipe", env: opts.env ?? globalThis.process.env });
  const close = () => process.kill("SIGTERM");
  let stderr = "";
  let announce!: (url: string) => void;
  let fail!: (error: Error) => void;
  const ready = new Promise<string>((resolve, reject) => {
    announce = resolve;
    fail = reject;
  });
  const timeout = setTimeout(() => {
    close();
    fail(new Error(`server startup timeout: ${stderr}`));
  }, 10_000);
  void (async () => {
    for await (const bytes of process.stderr) {
      stderr = (stderr + new TextDecoder().decode(bytes)).slice(-16000);
      const url = /mekuru viewer: (http:\/\/[^\s]+)/.exec(stderr)?.[1];
      if (url) announce(url);
    }
    fail(new Error(`server exited (${await process.exited}): ${stderr}`));
  })().catch((error) => fail(error));
  try {
    return { url: await ready, close, exited: process.exited, pid: process.pid };
  } finally {
    clearTimeout(timeout);
  }
}
