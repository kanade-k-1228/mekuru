import { mkdir, writeFile } from "node:fs/promises";
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

const readClient = async (file: string): Promise<Client> => {
  if (!(await Bun.file(file).exists())) {
    throw new Error(`no OAuth client: save the JSON of the OAuth client (a desktop app) of your Google Cloud project as ${file}`);
  }
  const c = ((await Bun.file(file).json()) as { installed?: Partial<Client> }).installed;
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
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const state = crypto.randomUUID();
  let server: ReturnType<typeof Bun.serve> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let redirect = "";
  try {
    const code = await new Promise<string>((done, fail) => {
      server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(req) {
          const got = new URL(req.url).searchParams;
          if (got.get("state") !== state) return new Response(null, { status: 404 });
          clearTimeout(timer);
          const code = got.get("code");
          if (code) done(code);
          else fail(new Error(`the sign-in failed: ${got.get("error") ?? "no code"}`));
          return new Response(
            code
              ? "<p>Mekuru Movie Maker: signed in to YouTube. You can close this tab.</p>"
              : "<p>Mekuru Movie Maker: the sign-in failed. See the terminal.</p>",
            { headers: { "content-type": "text/html; charset=utf-8", connection: "close" } },
          );
        },
      });
      redirect = `http://127.0.0.1:${server.port}`;
      timer = setTimeout(() => fail(new Error("timed out waiting for the sign-in in the browser")), SIGN_IN_TIMEOUT);
      const url = new URL(client.auth_uri);
      url.search = new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirect,
        response_type: "code",
        scope: SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: new Bun.CryptoHasher("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      console.error(`Sign in to YouTube in the browser:\n  ${url}`);
      open(url.toString());
    });
    const t = await requestToken(client, { code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirect });
    if (!t.ok || !t.access_token || !t.refresh_token) throw new Error(`the sign-in failed: ${t.error_description ?? t.error ?? "no token"}`);
    return { access: t.access_token, refresh: t.refresh_token };
  } finally {
    clearTimeout(timer);
    await server?.stop();
  }
};

export const accessToken = async (open: (url: string) => void): Promise<string> => {
  const dir = configDir();
  const client = await readClient(join(dir, "youtube-client.json"));
  const tokenFile = join(dir, "youtube-token.json");
  if (await Bun.file(tokenFile).exists()) {
    const { refresh_token } = (await Bun.file(tokenFile).json()) as { refresh_token: string };
    const t = await requestToken(client, { refresh_token, grant_type: "refresh_token" });
    if (t.ok && t.access_token) return t.access_token;
    if (t.error !== "invalid_grant") throw new Error(`cannot renew the sign-in: ${t.error_description ?? t.error ?? "no token"}`);
    console.error("The sign-in to YouTube has expired.");
  }
  const { access, refresh } = await signIn(client, open);
  await mkdir(dir, { recursive: true });
  // Bun.write does not reliably apply mode when creating a file; keep the refresh token private.
  await writeFile(tokenFile, `${JSON.stringify({ refresh_token: refresh })}\n`, { mode: 0o600 });
  return access;
};
