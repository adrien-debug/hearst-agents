/**
 * Composio Discovery — per-user tool resolution against the new SDK.
 *
 * Strategy:
 *  - List the user's connected toolkits via `connectedAccounts.list`.
 *  - For each connected toolkit, list the tools via `tools.list({toolkits, userId})`.
 *
 * Cached per (userId × toolkit-filter) for 5 minutes — invalidated on
 * connect / disconnect.
 */

import { getComposio, isComposioConfigured } from "./client";

export interface DiscoveredTool {
  /** Composio tool slug, e.g. "GMAIL_SEND_EMAIL". Stable identifier. */
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Toolkit slug this tool belongs to. */
  app: string;
}

interface CacheEntry {
  tools: DiscoveredTool[];
  expiresAt: number;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

export function resetDiscoveryCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  const prefix = `${userId}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function invalidateUserDiscovery(userId: string): void {
  resetDiscoveryCache(userId);
}

interface RawTool {
  slug?: string;
  name?: string;
  description?: string;
  inputParameters?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  toolkit?: { slug?: string } | string;
}

function toDiscoveredTool(raw: RawTool): DiscoveredTool | null {
  const name = (raw.slug ?? raw.name ?? "").toUpperCase();
  if (!name) return null;
  const app =
    typeof raw.toolkit === "object" && raw.toolkit?.slug
      ? raw.toolkit.slug.toLowerCase()
      : (typeof raw.toolkit === "string" ? raw.toolkit.toLowerCase() : name.split("_")[0]?.toLowerCase()) ?? "unknown";
  return {
    name,
    description: raw.description ?? "",
    parameters: raw.inputParameters ?? raw.parameters ?? { type: "object", properties: {} },
    app,
  };
}

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

  const composio = await getComposio();
  if (!composio) return [];

  try {
    const filter = opts.apps && opts.apps.length > 0
      ? { userId, toolkits: opts.apps.map((a) => a.toLowerCase()) }
      : { userId };
    const raw = (await composio.tools.list(filter)) as { items?: RawTool[] } | RawTool[];
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);
    const tools = items
      .map(toDiscoveredTool)
      .filter((t): t is DiscoveredTool => t !== null);
    cache.set(cacheKey, { tools, expiresAt: now + TTL_MS });
    return tools;
  } catch (err) {
    console.error(`[Composio/Discovery] tools.list failed for ${userId}:`, err);
    return [];
  }
}

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

export function toOpenAITools(tools: DiscoveredTool[]): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
