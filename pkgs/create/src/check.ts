const output = async (cmd: string, args: string[]): Promise<string | undefined> => {
  try {
    const child = Bun.spawn([cmd, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 10_000, killSignal: "SIGKILL" });
    const [text, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return code === 0 ? text : undefined;
  } catch {
    return undefined;
  }
};

export const checkFfmpeg = async (): Promise<{ ok: boolean; detail: string }> => {
  const ffmpeg = process.env.MEKURU_FFMPEG || "ffmpeg";
  const ffprobe = process.env.MEKURU_FFPROBE || "ffprobe";
  const [version, encoders, probe] = await Promise.all([
    output(ffmpeg, ["-version"]),
    output(ffmpeg, ["-hide_banner", "-encoders"]),
    output(ffprobe, ["-version"]),
  ]);
  const missing =
    version === undefined
      ? `${ffmpeg} is not found`
      : probe === undefined
        ? `${ffprobe} is not found`
        : !/\blibx264\b/.test(encoders ?? "")
          ? `${ffmpeg} has no libx264`
          : undefined;
  if (missing) return { ok: false, detail: `${missing} (install ffmpeg with libx264, or set MEKURU_FFMPEG / MEKURU_FFPROBE)` };
  return { ok: true, detail: /version (\S+)/.exec(version ?? "")?.[1] ?? "found" };
};
