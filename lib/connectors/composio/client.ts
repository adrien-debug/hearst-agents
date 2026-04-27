/**
 * Composio Client — thin singleton over `@composio/core`.
 *
 * Migrated from the legacy `composio-core` (OpenAIToolSet pattern) to the
 * v0.6 SDK. Key differences:
 *  - `Composio` is the entry point; sub-modules are `tools`, `toolkits`,
 *    `connectedAccounts`, `mcp`, plus a `create(userId)` factory for
 *    Tool Router (MCP) sessions.
 *  - "Apps" are now "toolkits".
 *  - `executeAction({action, entityId, params})` becomes
 *    `composio.tools.execute(slug, { userId, arguments })`.
 *  - `connectedAccounts.initiate({entityId, appName})` becomes
 *    `composio.toolkits.authorize(userId, toolkitSlug)`.
 *
 * The SDK is loaded lazily so test runs without a live key still typecheck.
 */

import type { ComposioCallParams, ComposioResult } from "./types";

interface ComposioClient {
  // We only declare the surfaces we actually call. The full SDK surface is
  // huge; this keeps the structural type local + decoupled from SDK churn.
  tools: {
    execute(
      slug: string,
      body: { userId: string; arguments?: Record<string, unknown> },
    ): Promise<unknown>;
    list(query: { userId?: string; toolkits?: string[] }): Promise<unknown>;
  };
  toolkits: {
    list(query?: Record<string, unknown>): Promise<unknown>;
    get(slug: string): Promise<unknown>;
    authorize(userId: string, toolkitSlug: string, authConfigId?: string): Promise<{
      id: string;
      redirectUrl?: string | null;
    }>;
  };
  connectedAccounts: {
    list(query?: { userIds?: string[]; toolkitSlugs?: string[]; statuses?: string[] }): Promise<unknown>;
    delete(nanoid: string): Promise<unknown>;
  };
  /** Create a per-user Tool Router (MCP) session. */
  create(userId: string, config?: Record<string, unknown>): Promise<{
    sessionId: string;
    url?: string;
    mcp?: { type: string; url: string; headers?: Record<string, string> };
    tools?: () => Promise<unknown>;
  }>;
}

let cachedClient: ComposioClient | null = null;
let initFailed:
  | { code: "NOT_CONFIGURED" | "SDK_NOT_INSTALLED"; message: string }
  | null = null;

export function resetComposioClient(): void {
  cachedClient = null;
  initFailed = null;
}

export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

async function getClient(): Promise<ComposioClient | null> {
  if (cachedClient) return cachedClient;
  if (initFailed) return null;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    initFailed = {
      code: "NOT_CONFIGURED",
      message: "COMPOSIO_API_KEY is not set — composio actions are disabled.",
    };
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — peer dep, may not be installed
    const mod: unknown = await import("@composio/core");
    const m = mod as {
      Composio?: new (config?: { apiKey?: string }) => ComposioClient;
    };
    if (!m.Composio) {
      initFailed = {
        code: "SDK_NOT_INSTALLED",
        message: "@composio/core is installed but does not export `Composio`.",
      };
      return null;
    }
    cachedClient = new m.Composio({ apiKey });
    return cachedClient;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    initFailed = {
      code: "SDK_NOT_INSTALLED",
      message: `@composio/core failed to load: ${msg}. Run \`npm install @composio/core\`.`,
    };
    return null;
  }
}

/** Public accessor used by other Composio modules. */
export async function getComposio(): Promise<ComposioClient | null> {
  return getClient();
}

/**
 * Returns the last initialization failure (if any) so callers can surface
 * a real error to the UI instead of silently returning empty results.
 */
export function getComposioInitError(): { code: string; message: string } | null {
  return initFailed;
}

/**
 * Execute a single Composio action (tool) for a user. Always returns a
 * `{ ok, data?, error?, errorCode? }` envelope — never throws.
 *
 * `entityId` from the old API is the new SDK's `userId`.
 */
export async function executeComposioAction(
  call: ComposioCallParams,
): Promise<ComposioResult> {
  const client = await getClient();
  if (!client) {
    return {
      ok: false,
      error: initFailed?.message ?? "Composio not initialized.",
      errorCode: initFailed?.code ?? "NOT_CONFIGURED",
    };
  }

  try {
    const data = await client.tools.execute(call.action, {
      userId: call.entityId,
      arguments: call.params,
    });
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const looksLikeAuth =
      /(connected.*account|not.*authoriz|missing.*connection|unauthorized|no.*active.*connection)/i.test(
        msg,
      );
    return {
      ok: false,
      error: msg,
      errorCode: looksLikeAuth ? "AUTH_REQUIRED" : "ACTION_FAILED",
    };
  }
}
