export const runScript = (command: string, root: string, writes: () => number, onError: (error: string) => void): (() => void) => {
  let closed = false;
  let child: Bun.Subprocess | undefined;
  let pause: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    closed = true;
    clearTimeout(pause);
    child?.kill("SIGTERM");
  };
  if (command) {
    const [shell, args] = process.platform === "win32" ? ["cmd", ["/C", command]] : ["sh", ["-c", command]];
    const env = { ...process.env, BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD: process.env.BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD ?? "1" };
    try {
      const proc = Bun.spawn([shell, ...args], {
        cwd: root,
        env,
        stdin: "ignore",
        stdout: "inherit",
        stderr: "pipe",
        onExit(_proc, code, signal) {
          if (!closed) console.error(`\`${command}\` exited (${signal ?? code})`);
        },
      });
      child = proc;
      void (async () => {
        let text = "";
        let since = writes();
        const decoder = new TextDecoder();
        for await (const chunk of proc.stderr) {
          process.stderr.write(chunk);
          if (writes() !== since) {
            text = "";
            since = writes();
          }
          text += Bun.stripANSI(decoder.decode(chunk, { stream: true }));
          clearTimeout(pause);
          pause = setTimeout(() => {
            if (!closed && writes() === since && text.trim()) {
              onError(text);
            }
          }, 150);
        }
      })().catch((e: unknown) => {
        onError(String(e));
      });
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return close;
};
