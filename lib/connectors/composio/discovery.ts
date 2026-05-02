/**
 * Composio Discovery — per-user tool resolution against the new SDK.
 *
 * Strategy:
 *  1. List the user's ACTIVE connected toolkits via `connectedAccounts.list`.
 *     This is the source-of-truth — `tools.get({userId})` alone has been
 *     observed returning empty sets after a fresh OAuth (eventual consistency
 *     on Composio's side), which produced "Slack n'est pas connecté"
 *     hallucinations even when the toolkit was ACTIVE.
 *  2. Fetch tool definitions via `tools.get(userId, { toolkits: [active], limit })`.
 *     The SDK returns OpenAI-style `{ type, function: { name, description, parameters } }`.
 *  3. If a toolkit is ACTIVE but the SDK returns no tools for it, the
 *     discrepancy is logged so we can detect propagation lag.
 *
 * Cache: 60s TTL (reduced from 5min). We also refuse to cache empty results
 * — a freshly-connected user would otherwise be locked out for the full TTL.
 * Invalidated explicitly on connect / disconnect / OAuth return.
 */

import { getComposio } from "./client";
import { listConnections } from "./connections";

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

const TTL_MS = 60_000;
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
  type?: "function";
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

function toDiscoveredTool(raw: RawTool): DiscoveredTool | null {
  const fn = raw.function;
  if (!fn?.name) return null;
  const name = fn.name.toUpperCase();
  const app = name.split("_")[0]?.toLowerCase() ?? "unknown";
  return {
    name,
    description: fn.description ?? "",
    parameters: fn.parameters ?? { type: "object", properties: {} },
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
    // 1. Source-of-truth: which toolkits does the user actually have ACTIVE?
    //    `apps` filter (if provided) intersects with the active set so we
    //    never query for toolkits the user hasn't connected.
    const accounts = await listConnections(userId);
    const activeSlugs = Array.from(
      new Set(
        accounts
          .filter((a) => a.status === "ACTIVE")
          .map((a) => a.appName.toLowerCase())
          .filter(Boolean),
      ),
    );

    const requestedSlugs = (opts.apps ?? []).map((a) => a.toLowerCase());
    const targetSlugs =
      requestedSlugs.length > 0
        ? activeSlugs.filter((s) => requestedSlugs.includes(s))
        : activeSlugs;

    if (targetSlugs.length === 0) {
      console.log(
        `[Composio/Discovery] userId=${userId} — no ACTIVE toolkits ` +
          `(connectedAccounts: ${accounts.length} total, statuses: ${accounts.map((a) => `${a.appName}:${a.status}`).join(", ") || "none"})`,
      );
      // Don't cache an empty result — the user might be mid-OAuth.
      return [];
    }

    // 2. Fetch tool definitions PER TOOLKIT en parallèle.
    //    L'API Composio limite la réponse globale (limit=100 retourne 100 max
    //    AU TOTAL sur tous les toolkits demandés). Pour un user avec 5+ apps,
    //    ça tronque silencieusement — les premiers toolkits (alphabétique)
    //    saturent la limite, les suivants (slack, stripe, etc.) reviennent
    //    vides → "ACTIVE toolkits with no tools" warning + agent qui dit
    //    "je n'ai pas accès à Slack". Itération individuelle = couverture
    //    équitable et déterministe entre toolkits.
    const TOOLS_PER_TOOLKIT = 25;
    const perToolkitResults = await Promise.all(
      targetSlugs.map(async (slug) => {
        try {
          const raw = (await composio.tools.get(userId, {
            toolkits: [slug],
            limit: TOOLS_PER_TOOLKIT,
          })) as { items?: RawTool[] } | RawTool[];
          return Array.isArray(raw) ? raw : (raw.items ?? []);
        } catch (err) {
          console.warn(
            `[Composio/Discovery] tools.get failed for toolkit ${slug}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
          return [];
        }
      }),
    );
    const items = perToolkitResults.flat();
    const tools = items
      .map(toDiscoveredTool)
      .filter((t): t is DiscoveredTool => t !== null);

    // 3. Detect Composio propagation lag: toolkit ACTIVE but no tools listed.
    const slugsInTools = new Set(tools.map((t) => t.app));
    const missing = targetSlugs.filter((s) => !slugsInTools.has(s));
    if (missing.length > 0) {
      console.warn(
        `[Composio/Discovery] userId=${userId} — ACTIVE toolkits with no tools: ${missing.join(", ")} ` +
          `(tools.get returned ${tools.length} tools across ${slugsInTools.size} toolkits). ` +
          `Likely Composio eventual-consistency lag — retry shortly.`,
      );
    }

    console.log(
      `[Composio/Discovery] userId=${userId} — ${tools.length} tools across [${[...slugsInTools].join(", ")}]`,
    );

    // Only cache when we actually got tools — avoid pinning an empty
    // response right after OAuth completion.
    if (tools.length > 0) {
      cache.set(cacheKey, { tools, expiresAt: now + TTL_MS });
    }
    return tools;
  } catch (err) {
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      `[Composio/Discovery] tools.get failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      stack,
    );
    return [];
  }
}

/**
 * Liste les tools d'UN toolkit, **sans filtrer** par connexions actives.
 *
 * Différence avec `getToolsForUser` : la fonction principale n'expose que
 * les tools des toolkits que l'utilisateur a effectivement connectés.
 * `getToolsForApp` est utilisé côté UI (drawer /apps) pour montrer
 * "ce que ton agent pourra faire" AVANT la connexion — discovery éditoriale,
 * pas runtime.
 *
 * Cache séparé du cache principal (clé préfixée `app::`) pour éviter de
 * pourrir les lookups runtime quand on browse le catalogue.
 */
const appCache = new Map<string, CacheEntry>();
const APP_TTL_MS = 5 * 60_000;

export async function getToolsForApp(
  userId: string,
  app: string,
): Promise<DiscoveredTool[]> {
  if (!userId || !app) return [];

  const slug = app.toLowerCase();
  const cacheKey = `app::${slug}`;
  const now = Date.now();
  const hit = appCache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.tools;

  const composio = await getComposio();
  if (!composio) return [];

  try {
    const raw = (await composio.tools.get(userId, {
      toolkits: [slug],
      limit: 100,
    })) as { items?: RawTool[] } | RawTool[];
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);
    const tools = items
      .map(toDiscoveredTool)
      .filter((t): t is DiscoveredTool => t !== null);

    if (tools.length > 0) {
      appCache.set(cacheKey, { tools, expiresAt: now + APP_TTL_MS });
    }
    return tools;
  } catch (err) {
    console.warn(
      `[Composio/Discovery] getToolsForApp(${slug}) failed: ` +
        (err instanceof Error ? err.message : String(err)),
    );
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
