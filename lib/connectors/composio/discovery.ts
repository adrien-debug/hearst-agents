/**
 * Composio Discovery — dynamic per-user tool resolution.
 *
 * Multi-tenant by design: every call is scoped by `userId`, which we map 1:1
 * onto Composio's `entityId`. A user only ever sees actions for the apps
 * THEY have connected — the LLM cannot accidentally call something on
 * another tenant's account because the entityId travels with every request.
 *
 * Caching: each user's tool list is cached for 5 minutes. The TTL matches
 * the typical chat session length and gives a strong floor on RTT to
 * Composio's API (one fetch per user per 5 min, not one per LLM turn).
 */

import { getComposioToolset } from "./client";

export interface DiscoveredTool {
  /** Composio action slug, e.g. "GMAIL_SEND_EMAIL". Stable identifier. */
  name: string;
  /** Human-friendly description (the schema Composio ships to LLMs). */
  description: string;
  /** JSON Schema for the action's parameters (Anthropic / OpenAI compatible). */
  parameters: Record<string, unknown>;
  /** App slug this action belongs to ("gmail", "slack", ...). */
  app: string;
}

interface CacheEntry {
  tools: DiscoveredTool[];
  expiresAt: number;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

/** Reset the discovery cache. Tests + manual invalidation after connect/disconnect. */
export function resetDiscoveryCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Force-invalidate one user's cache — call this after a connect/disconnect. */
export function invalidateUserDiscovery(userId: string): void {
  cache.delete(userId);
}

interface RawComposioTool {
  type?: "function";
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

function toDiscoveredTool(raw: unknown): DiscoveredTool | null {
  const t = raw as RawComposioTool;
  const fn = t?.function;
  if (!fn?.name) return null;
  // Action slugs follow `<APP>_<VERB_OBJECT>` — first underscore-separated
  // segment is the app name (lowercased to match Composio's app slugs).
  const app = fn.name.split("_")[0]?.toLowerCase() ?? "unknown";
  return {
    name: fn.name,
    description: fn.description ?? "",
    parameters: fn.parameters ?? { type: "object", properties: {} },
    app,
  };
}

/**
 * Get the LLM-callable tool list for a given user.
 *
 * @param userId — Hearst user id; used as Composio entityId.
 * @param opts — optional `apps` filter to restrict to specific apps, and
 *   `force` to skip cache.
 */
export async function getToolsForUser(
  userId: string,
  opts: { apps?: string[]; force?: boolean } = {},
): Promise<DiscoveredTool[]> {
  if (!userId) return [];

  const cacheKey = `${userId}::${(opts.apps ?? []).sort().join(",")}`;
  const now = Date.now();
  if (!opts.force) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now) return hit.tools;
  }

  const toolset = await getComposioToolset();
  if (!toolset) return [];

  let raw: unknown[];
  try {
    raw = await toolset.getTools(
      {
        ...(opts.apps && opts.apps.length > 0 ? { apps: opts.apps } : {}),
        // Skips actions for apps the user hasn't connected — this is what
        // gives us the multi-tenant filtering for free.
        filterByAvailableApps: true,
      },
      userId,
    );
  } catch (err) {
    console.error(`[Composio/Discovery] getTools failed for ${userId}:`, err);
    return [];
  }

  const tools = raw
    .map(toDiscoveredTool)
    .filter((t): t is DiscoveredTool => t !== null);

  cache.set(cacheKey, { tools, expiresAt: now + TTL_MS });
  return tools;
}

/**
 * Convert discovered tools to Anthropic's tool-use format.
 * Anthropic expects { name, description, input_schema }.
 */
export function toAnthropicTools(tools: DiscoveredTool[]): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * Convert discovered tools to OpenAI's function-calling format.
 */
export function toOpenAITools(tools: DiscoveredTool[]): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
