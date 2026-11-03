import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export const configDir = (): string => {
  if (process.env.MEKURU_CONFIG_DIR) return process.env.MEKURU_CONFIG_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mekuru");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "mekuru");
};

export const openBrowser = (url: string): void => {
  const wsl = process.platform === "linux" && (!!process.env.WSL_INTEROP || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop"));
  const tries: string[][] = wsl
    ? [["wslview"], ["cmd.exe", "/c", "start", ""]]
    : process.platform === "darwin"
      ? [["open"]]
      : process.platform === "win32"
        ? [["cmd", "/c", "start", ""]]
        : [["xdg-open"]];
  for (const [cmd, ...args] of tries) {
    const target = cmd.startsWith("cmd") ? url.replaceAll("&", "^&") : url;
    try {
      Bun.spawn([cmd, ...args, target], { stdin: "ignore", stdout: "ignore", stderr: "ignore", cwd: wsl ? "/mnt/c" : undefined }).unref();
      break;
    } catch {}
  }
};
