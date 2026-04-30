/**
 * Playwright bridge — connect-over-CDP à une session Browserbase.
 *
 * On évite le SDK Stagehand (conflit ai@5 vs ai@6 + bundle chromium lourd)
 * en se branchant directement sur le `connectUrl` Browserbase via
 * `playwright-core` (require optionnel, pas dans le bundle Next).
 *
 * `playwright-core` est présent en transitive deps via `@browserbasehq/sdk`.
 * On l'importe en dynamic import + try/catch — si l'environnement n'a pas
 * la lib (build serverless minimal), on retourne `null` et l'executor passe
 * en mode "screenshot only" via Browserbase REST API.
 *
 * Lifecycle :
 *  - getBrowserContext({ sessionId, connectUrl }) → { browser, context, page, close }
 *  - L'appelant DOIT appeler close() même en cas d'erreur (try/finally).
 *  - On ne ferme PAS la session Browserbase ici (côté tâche métier).
 */

import { getSession } from "@/lib/capabilities/providers/browserbase";

export interface PlaywrightBridge {
  browser: unknown;
  context: unknown;
  page: PlaywrightPage;
  close: () => Promise<void>;
}

/** Surface minimale qu'on consomme — évite de tirer les types playwright-core. */
export interface PlaywrightPage {
  goto(url: string, opts?: { waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeout?: number }): Promise<unknown>;
  waitForLoadState(state?: "load" | "domcontentloaded" | "networkidle", opts?: { timeout?: number }): Promise<void>;
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  screenshot(opts?: { type?: "png" | "jpeg"; fullPage?: boolean }): Promise<Buffer>;
  click(selector: string, opts?: { timeout?: number }): Promise<void>;
  fill(selector: string, value: string, opts?: { timeout?: number }): Promise<void>;
  evaluate<R>(fn: string | ((arg?: unknown) => R)): Promise<R>;
}

interface ChromiumLike {
  connectOverCDP(url: string, opts?: { timeout?: number }): Promise<{
    contexts(): unknown[];
    newContext?(): Promise<unknown>;
    close(): Promise<void>;
  }>;
}

let cachedChromium: ChromiumLike | null | undefined;

async function loadChromium(): Promise<ChromiumLike | null> {
  if (cachedChromium !== undefined) return cachedChromium;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — peer dep dynamique, types pas indispensables
    const mod: unknown = await import("playwright-core");
    const m = mod as { chromium?: ChromiumLike };
    cachedChromium = m.chromium ?? null;
    return cachedChromium;
  } catch (err) {
    console.warn(
      "[playwright-bridge] playwright-core indisponible — fallback REST screenshot only :",
      err instanceof Error ? err.message : err,
    );
    cachedChromium = null;
    return null;
  }
}

export function isPlaywrightAvailable(): Promise<boolean> {
  return loadChromium().then((c) => c !== null);
}

/**
 * Récupère ou résout le connectUrl pour une session Browserbase puis
 * ouvre un browser CDP. Retourne `null` si playwright-core indisponible.
 */
export async function getBrowserContext(opts: {
  sessionId: string;
  connectUrl?: string;
  /** Timeout connexion CDP (default 15s). */
  timeoutMs?: number;
}): Promise<PlaywrightBridge | null> {
  const chromium = await loadChromium();
  if (!chromium) return null;

  let url = opts.connectUrl;
  if (!url) {
    const session = await getSession(opts.sessionId);
    url = session.connectUrl;
  }
  if (!url) {
    throw new Error(`[playwright-bridge] connectUrl introuvable pour session ${opts.sessionId}`);
  }

  const browser = await chromium.connectOverCDP(url, { timeout: opts.timeoutMs ?? 15_000 });

  // Browserbase fournit déjà un context + page par défaut côté browser CDP.
  const contexts = browser.contexts();
  const ctx = (contexts[0] ?? (await browser.newContext?.())) as {
    pages?: () => PlaywrightPage[];
    newPage?: () => Promise<PlaywrightPage>;
  };
  if (!ctx) {
    await browser.close().catch(() => {});
    throw new Error("[playwright-bridge] aucun context CDP disponible");
  }

  const pages = ctx.pages?.() ?? [];
  const page: PlaywrightPage =
    pages[0] ?? (await ctx.newPage!());

  return {
    browser,
    context: ctx,
    page,
    async close() {
      try {
        await browser.close();
      } catch {
        // ignore — la session reste alive côté Browserbase
      }
    },
  };
}

/**
 * Helper test : injecte une fake page (utilisé par les tests stagehand).
 */
export interface FakePageOptions {
  url?: string;
  title?: string;
  content?: string;
  screenshot?: Buffer;
}

export function createFakePage(o: FakePageOptions = {}): PlaywrightPage {
  let currentUrl = o.url ?? "about:blank";
  return {
    async goto(u) {
      currentUrl = u;
      return null;
    },
    async waitForLoadState() {
      // no-op
    },
    url() {
      return currentUrl;
    },
    async title() {
      return o.title ?? "Fake Page";
    },
    async content() {
      return o.content ?? "<html></html>";
    },
    async screenshot() {
      return o.screenshot ?? Buffer.from("png-fake");
    },
    async click() {
      // no-op
    },
    async fill() {
      // no-op
    },
    async evaluate(fn) {
      if (typeof fn === "function") return (fn as (a?: unknown) => unknown)() as never;
      return null as never;
    },
  };
}
