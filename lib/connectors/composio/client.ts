/**
 * Composio Client — thin adapter over the Composio SDK.
 *
 * Design notes
 * ────────────
 * - The SDK is loaded *lazily* via dynamic `import()` so the package can stay
 *   optional: code that doesn't call this module never pays the import cost,
 *   and CI builds without the dependency installed still typecheck.
 * - Result is always a `{ ok, data?, error?, errorCode? }` shape — callers
 *   never see SDK-specific exceptions, so swapping the underlying provider
 *   later (Pipedream Connect, Paragon, in-house) is a one-file change.
 * - Configuration is checked once on first call; subsequent calls reuse the
 *   cached client.
 */

import type { ComposioCallParams, ComposioResult } from "./types";

/**
 * Minimal structural type covering the methods we use from `OpenAIToolSet`.
 * Defined here (rather than importing from `composio-core`) so the rest of
 * the codebase typechecks even when the SDK isn't installed.
 */
export interface ComposioToolset {
  executeAction(args: {
    action: string;
    params: Record<string, unknown>;
    entityId: string;
  }): Promise<unknown>;
  getTools(
    filters: {
      apps?: string[];
      actions?: string[];
      tags?: string[];
      useCase?: string;
      filterByAvailableApps?: boolean;
    },
    entityId?: string,
  ): Promise<unknown[]>;
  client: {
    connectedAccounts: {
      list(args: { user_uuid?: string; appNames?: string; showActiveOnly?: boolean }): Promise<unknown>;
      initiate(args: {
        entityId?: string;
        appName?: string;
        redirectUri?: string;
        authMode?: string;
      }): Promise<{ redirectUrl?: string | null; connectedAccountId?: string }>;
      delete(args: { connectedAccountId: string }): Promise<unknown>;
    };
    apps: {
      list(): Promise<unknown>;
    };
  };
}

let cachedToolset: ComposioToolset | null = null;
let initFailed: { code: "NOT_CONFIGURED" | "SDK_NOT_INSTALLED"; message: string } | null = null;

/** Resets the cached client. Used in tests. */
export function resetComposioClient(): void {
  cachedToolset = null;
  initFailed = null;
}

export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

/**
 * Returns the Composio toolset singleton, or `null` if Composio is not
 * configured / not installed. Discovery + connections modules go through
 * this getter so they share the same cached instance and error envelope.
 */
export async function getComposioToolset(): Promise<ComposioToolset | null> {
  return getToolset();
}

async function getToolset(): Promise<ComposioToolset | null> {
  if (cachedToolset) return cachedToolset;
  if (initFailed) return null;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    initFailed = {
      code: "NOT_CONFIGURED",
      message: "COMPOSIO_API_KEY is not set — write actions are disabled.",
    };
    return null;
  }

  try {
    // Lazy import — `composio-core` is intentionally not in devDependencies
    // so installs without the env var don't pull a 50MB+ tree.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — peer dep, may not be installed
    const mod: unknown = await import("composio-core");

    const m = mod as { OpenAIToolSet?: new (opts: { apiKey: string }) => ComposioToolset };
    if (!m.OpenAIToolSet) {
      initFailed = {
        code: "SDK_NOT_INSTALLED",
        message:
          "composio-core is installed but does not export OpenAIToolSet — version mismatch.",
      };
      return null;
    }
    cachedToolset = new m.OpenAIToolSet({ apiKey });
    return cachedToolset;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    initFailed = {
      code: "SDK_NOT_INSTALLED",
      message: `composio-core failed to load: ${msg}. Run \`npm install composio-core\`.`,
    };
    return null;
  }
}

/**
 * Execute a Composio action. Always returns a result envelope — never throws.
 */
export async function executeComposioAction(
  call: ComposioCallParams,
): Promise<ComposioResult> {
  const toolset = await getToolset();
  if (!toolset) {
    return {
      ok: false,
      error: initFailed?.message ?? "Composio not initialized.",
      errorCode: initFailed?.code ?? "NOT_CONFIGURED",
    };
  }

  try {
    const data = await toolset.executeAction({
      action: call.action,
      params: call.params,
      entityId: call.entityId,
    });
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Heuristic: Composio surfaces auth-missing errors with phrases like
    // "no connected account" / "not authorized". Map those to AUTH_REQUIRED
    // so the caller can prompt for connection instead of showing a 500.
    const looksLikeAuth = /(connected account|not authoriz|missing connection|unauthorized)/i.test(msg);
    return {
      ok: false,
      error: msg,
      errorCode: looksLikeAuth ? "AUTH_REQUIRED" : "ACTION_FAILED",
    };
  }
}
