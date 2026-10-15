import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const SIGN_IN_TIMEOUT = 5 * 60_000;

interface Client {
  client_id: string;
  client_secret: string;
  auth_uri: string;
  token_uri: string;
}

export const configDir = (): string => {
  if (process.env.MEKURU_CONFIG_DIR) return process.env.MEKURU_CONFIG_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mekuru");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "mekuru");
};

const readClient = (file: string): Client => {
  if (!existsSync(file)) {
    throw new Error(`no OAuth client: save the JSON of the OAuth client (a desktop app) of your Google Cloud project as ${file}`);
  }
  const c = (JSON.parse(readFileSync(file, "utf8")) as { installed?: Partial<Client> }).installed;
  if (!c?.client_id || !c.client_secret) throw new Error(`${file} is not the JSON of an OAuth client of a desktop app`);
  return {
    client_id: c.client_id,
    client_secret: c.client_secret,
    auth_uri: c.auth_uri ?? "https://accounts.google.com/o/oauth2/auth",
    token_uri: c.token_uri ?? "https://oauth2.googleapis.com/token",
  };
};

interface TokenResponse {
  ok: boolean;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

const requestToken = async (client: Client, params: Record<string, string>): Promise<TokenResponse> => {
  const res = await fetch(client.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, ...params }),
  });
  return { ok: res.ok, ...((await res.json().catch(() => ({}))) as Omit<TokenResponse, "ok">) };
};

const signIn = async (client: Client, open: (url: string) => void): Promise<{ access: string; refresh: string }> => {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const server = createServer();
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => done());
  });
  const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const code = await new Promise<string>((done, fail) => {
      const timer = setTimeout(() => fail(new Error("timed out waiting for the sign-in in the browser")), SIGN_IN_TIMEOUT);
      server.on("request", (req, res) => {
        const got = new URL(req.url ?? "/", redirect).searchParams;
        if (got.get("state") !== state) return void res.writeHead(404, { Connection: "close" }).end();
        clearTimeout(timer);
        const code = got.get("code");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", Connection: "close" });
        res.end(
          code
            ? "<p>Mekuru Movie Maker: signed in to YouTube. You can close this tab.</p>"
            : "<p>Mekuru Movie Maker: the sign-in failed. See the terminal.</p>",
        );
        if (code) done(code);
        else fail(new Error(`the sign-in failed: ${got.get("error") ?? "no code"}`));
      });
      const url = new URL(client.auth_uri);
      url.search = new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirect,
        response_type: "code",
        scope: SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      console.error(`Sign in to YouTube in the browser:\n  ${url}`);
      open(url.toString());
    });
    const t = await requestToken(client, { code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirect });
    if (!t.ok || !t.access_token || !t.refresh_token) throw new Error(`the sign-in failed: ${t.error_description ?? t.error ?? "no token"}`);
    return { access: t.access_token, refresh: t.refresh_token };
  } finally {
    server.close();
    server.closeAllConnections();
  }
};

export const accessToken = async (open: (url: string) => void): Promise<string> => {
  const dir = configDir();
  const client = readClient(join(dir, "youtube-client.json"));
  const tokenFile = join(dir, "youtube-token.json");
  if (existsSync(tokenFile)) {
    const { refresh_token } = JSON.parse(readFileSync(tokenFile, "utf8")) as { refresh_token: string };
    const t = await requestToken(client, { refresh_token, grant_type: "refresh_token" });
    if (t.ok && t.access_token) return t.access_token;
    if (t.error !== "invalid_grant") throw new Error(`cannot renew the sign-in: ${t.error_description ?? t.error ?? "no token"}`);
    console.error("The sign-in to YouTube has expired.");
  }
  const { access, refresh } = await signIn(client, open);
  mkdirSync(dir, { recursive: true });
  writeFileSync(tokenFile, `${JSON.stringify({ refresh_token: refresh })}\n`, { mode: 0o600 });
  return access;
};
