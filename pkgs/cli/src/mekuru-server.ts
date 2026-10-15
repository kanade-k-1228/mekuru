#!/usr/bin/env bun

import { Command, InvalidArgumentError } from "commander";
import { openBrowser, startServer } from "./server.ts";

const VERSION: string = (await Bun.file(new URL("../package.json", import.meta.url)).json()).version;

interface Options {
  run?: string;
  port: number;
  root?: string;
  title?: string;
  open?: boolean;
}

const parsePort = (value: string): number => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new InvalidArgumentError("a port is an integer from 0 to 65535");
  return port;
};

const openByDefault = (): boolean => !/^(0|false|no|off)$/i.test(process.env.MEKURU_OPEN ?? "");

const serve = async (xml: string, { open = openByDefault(), ...opts }: Options): Promise<void> => {
  const server = await startServer({ xml, ...opts }).catch((e: unknown) => {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  });
  process.stderr.write(`mekuru viewer: ${server.url}  (${opts.title ?? xml})\n`);
  if (open) openBrowser(server.url);
  const stop = () => {
    server.close();
    setTimeout(() => process.exit(0), 300).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
};

new Command("mekuru-server")
  .description(
    "The viewer of Mekuru Movie Maker: shows the video of the XML that a script writes in the browser, as a preview and a timeline, " +
      "and shows it again whenever the XML changes.",
  )
  .version(VERSION)
  .argument("<xml>", "the XML that the script writes (such as .mekuru/main.xml)")
  .option(
    "--run <cmd>",
    "a command that writes the XML (`bun --hot src/main.tsx`), run in the project folder while the viewer is open: " +
      "what it prints on stderr is shown as the error of the script until it writes the XML again",
  )
  .option("-p, --port <port>", "the port to listen on", parsePort, 3333)
  .option(
    "--root <dir>",
    "the project folder: the paths of the files are relative to it (default: the folder of the XML, or the one above it when that is .mekuru/)",
  )
  .option("--title <name>", "the name shown in the browser tab (default: the file name of the XML)")
  .option("--open", "open a browser (the default, unless the environment variable MEKURU_OPEN is 0)")
  .option("--no-open", "do not open a browser (in the terminal of VS Code, select the URL that it prints to open it in the integrated browser)")
  .showHelpAfterError("(add --help for more information)")
  .action(serve)
  .parseAsync();
