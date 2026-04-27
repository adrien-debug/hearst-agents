/**
 * Composio Apps catalog — list available apps + per-app metadata.
 *
 * Cached process-wide for 30 min (catalog is global, not per-user).
 */

import { getComposioToolset, isComposioConfigured } from "./client";

export interface ComposioApp {
  /** App slug (e.g. "slack", "googlecalendar"). Used in connect API. */
  key: string;
  name: string;
  description: string;
  logo: string;
  /** Comma-separated categories from Composio ("communication,productivity"). */
  categories: string[];
  noAuth: boolean;
}

interface RawAppInfo {
  appId?: string;
  key?: string;
  name?: string;
  description?: string;
  logo?: string;
  categories?: string;
  no_auth?: boolean;
  enabled?: boolean;
}

const CATALOG_TTL_MS = 30 * 60_000;
let cachedCatalog: { apps: ComposioApp[]; expiresAt: number } | null = null;

export function resetAppsCache(): void {
  cachedCatalog = null;
}

function normalize(raw: RawAppInfo): ComposioApp | null {
  if (!raw.key || !raw.name) return null;
  if (raw.enabled === false) return null;
  return {
    key: raw.key.toLowerCase(),
    name: raw.name,
    description: raw.description ?? "",
    logo: raw.logo ?? "",
    categories: (raw.categories ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
    noAuth: Boolean(raw.no_auth),
  };
}

/**
 * Returns the full Composio app catalog. Process-wide cache (catalog is
 * the same for everyone). Returns [] when Composio is not configured.
 */
export async function listAvailableApps(opts: { force?: boolean } = {}): Promise<ComposioApp[]> {
  if (!isComposioConfigured()) return [];

  const now = Date.now();
  if (!opts.force && cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.apps;
  }

  const toolset = await getComposioToolset();
  if (!toolset) return [];

  try {
    const raw = (await toolset.client.apps.list()) as RawAppInfo[];
    const apps = raw
      .map(normalize)
      .filter((a): a is ComposioApp => a !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    cachedCatalog = { apps, expiresAt: now + CATALOG_TTL_MS };
    return apps;
  } catch (err) {
    console.error("[Composio/Apps] list failed:", err);
    return [];
  }
}
