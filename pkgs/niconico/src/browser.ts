import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";
import { descriptionOf, type Settings } from "./settings.ts";

export const UPLOAD_URL = "https://garage.nicovideo.jp/niconico-garage/video/upload";

const SIGN_IN_TIMEOUT = 10 * 60_000;
const FIELD_TIMEOUT = 60_000;
const UPLOAD_TIMEOUT = 30 * 60_000;
const POSTED_TIMEOUT = 2 * 60_000;

export const configDir = (): string => {
  if (process.env.MEKURU_CONFIG_DIR) return process.env.MEKURU_CONFIG_DIR;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "mekuru");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "mekuru");
};

const launch = async (headless: boolean): Promise<BrowserContext> => {
  const dir = join(configDir(), "niconico-browser");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    return await chromium.launchPersistentContext(dir, {
      headless,
      executablePath: process.env.MEKURU_BROWSER || undefined,
      locale: "ja-JP",
      viewport: { width: 1280, height: 900 },
    });
  } catch (e) {
    const message = (e as Error).message;
    if (/Executable doesn't exist/i.test(message)) {
      throw new Error("no browser for Playwright: install it with `bunx playwright-core install chromium` (or set MEKURU_BROWSER to a Chrome or Chromium)");
    }
    if (/in use|ProcessSingleton|SingletonLock/i.test(message)) throw new Error(`the browser profile ${dir} is in use by another @mekuru/niconico`);
    throw e;
  }
};

const firstPage = async (context: BrowserContext): Promise<Page> => context.pages()[0] ?? (await context.newPage());
const isSignInPage = (url: string): boolean => /login/i.test(new URL(url).pathname);

export const login = async (): Promise<void> => {
  const context = await launch(false);
  try {
    const page = await firstPage(context);
    await page.goto(UPLOAD_URL);
    if (isSignInPage(page.url())) {
      console.error("Sign in to niconico in the browser window.");
      const target = new URL(UPLOAD_URL).host;
      await page
        .waitForURL((url) => url.host === target && !isSignInPage(url.href), { timeout: SIGN_IN_TIMEOUT })
        .catch((e: Error) => {
          throw new Error(/closed/i.test(e.message) ? "the browser was closed before signing in" : `the sign-in did not finish: ${e.message}`);
        });
    }
  } finally {
    await context.close();
  }
};

const field = async (page: Page, what: string, ways: Locator[], timeout: number): Promise<Locator> => {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const way of ways) {
      const found = way.first();
      if (await found.isVisible().catch(() => false)) return found;
    }
    if (Date.now() > deadline) throw new Error(`cannot find the ${what} field in the upload page`);
    await page.waitForTimeout(500);
  }
};

const ids = async (page: Page): Promise<Set<string>> => {
  const text = `${page.url()} ${await page
    .locator("body")
    .innerText()
    .catch(() => "")}`;
  return new Set(text.match(/\b(?:sm|so|ss)\d{3,}\b/g) ?? []);
};

export interface UploadOptions {
  check?: boolean;
  headed?: boolean;
}

export const upload = async (file: string, s: Settings, options: UploadOptions & { thumbnail?: string } = {}): Promise<string | undefined> => {
  const { check = false, headed = false } = options;
  const context = await launch(!check && !headed);
  const page = await firstPage(context);
  try {
    await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded" });
  } catch (e) {
    await context.close().catch(() => undefined);
    throw e;
  }
  if (isSignInPage(page.url())) {
    await context.close();
    throw new Error("not signed in to niconico: run `@mekuru/niconico login` first");
  }
  try {
    console.error("choosing the file");
    const videoInput = page.locator('input[type="file"][accept*="video"]');
    await ((await videoInput.count()) ? videoInput : page.locator('input[type="file"]')).first().setInputFiles(file, { timeout: FIELD_TIMEOUT });
    const title = await field(
      page,
      "title",
      [page.getByLabel(/タイトル/), page.getByPlaceholder(/タイトル/), page.getByRole("textbox", { name: /タイトル/ }), page.locator('input[name*="title" i]')],
      FIELD_TIMEOUT,
    );
    await title.fill(s.title);
    const description = descriptionOf(s);
    if (description) {
      const box = await field(
        page,
        "description",
        [
          page.getByLabel(/説明/),
          page.getByPlaceholder(/説明/),
          page.getByRole("textbox", { name: /説明/ }),
          page.locator('textarea[name*="description" i]'),
          page.locator('[contenteditable="true"]'),
        ],
        FIELD_TIMEOUT,
      );
      await box.fill(description);
    }
    if (s.tags?.length) {
      const tag = await field(
        page,
        "tag",
        [page.getByLabel(/タグ/), page.getByPlaceholder(/タグ/), page.getByRole("textbox", { name: /タグ/ }), page.locator('input[name*="tag" i]')],
        FIELD_TIMEOUT,
      );
      for (const name of s.tags) {
        await tag.fill(name);
        await tag.press("Enter");
      }
    }
    if (options.thumbnail) {
      const input = page.locator('input[type="file"][accept*="image"]').first();
      try {
        await input.waitFor({ state: "attached", timeout: FIELD_TIMEOUT });
        await input.setInputFiles(options.thumbnail);
      } catch {
        console.error("warning: cannot find the thumbnail field in the upload page: the thumbnail is not set");
      }
    }
    for (const box of await page.getByRole("checkbox", { name: /同意/ }).all()) {
      if (await box.isChecked()) continue;
      await box.check();
      console.error(
        `checked: ${
          (
            (await box.getAttribute("aria-label")) ??
            (await box
              .locator("xpath=ancestor::label[1]")
              .innerText()
              .catch(() => ""))
          ).trim() || "a checkbox to agree"
        }`,
      );
    }

    if (check) {
      console.error("Filled in: check the form, and post it in the browser window (close the window to finish).");
      await page.waitForEvent("close", { timeout: 0 });
      return undefined;
    }
    const before = await ids(page);
    const post = page.getByRole("button", { name: /^\s*(投稿する|投稿|公開する|アップロードする)\s*$/ }).last();
    console.error("uploading (the post button waits for it)");
    await post.click({ timeout: UPLOAD_TIMEOUT });
    const deadline = Date.now() + POSTED_TIMEOUT;
    while (Date.now() < deadline) {
      const posted = [...(await ids(page))].find((id) => !before.has(id));
      if (posted) return posted;
      await page.waitForTimeout(1000);
    }
    return undefined;
  } catch (e) {
    const shot = join(process.cwd(), ".mekuru", "niconico-error.png");
    mkdirSync(dirname(shot), { recursive: true });
    const saved = await page.screenshot({ path: shot, fullPage: true }).then(
      () => true,
      () => false,
    );
    throw new Error(`${(e as Error).message}${saved ? `\n(the page then: ${shot})` : ""}`);
  } finally {
    await context.close().catch(() => undefined);
  }
};
