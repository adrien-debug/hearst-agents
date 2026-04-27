/**
 * Composio Toolkits catalog — list available toolkits (= "apps") +
 * per-toolkit metadata.
 *
 * The new SDK calls these "toolkits" but the public type stays
 * `ComposioApp` to avoid a UI-wide rename. Cached process-wide for 30 min
 * (catalog is global, not per-user).
 */

import { getComposio, isComposioConfigured } from "./client";

export interface ComposioApp {
  /** Toolkit slug (e.g. "slack", "googlecalendar"). */
  key: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  noAuth: boolean;
}

interface RawToolkit {
  slug?: string;
  key?: string;
  name?: string;
  meta?: {
    description?: string;
    logo?: string;
    categories?: Array<string | { slug?: string; name?: string }>;
  };
  description?: string;
  logo?: string;
  categories?: Array<string | { slug?: string; name?: string }>;
  authConfig?: { authScheme?: string };
  authSchemes?: string[];
  noAuth?: boolean;
}

const CATALOG_TTL_MS = 30 * 60_000;
let cachedCatalog: { apps: ComposioApp[]; expiresAt: number } | null = null;

export function resetAppsCache(): void {
  cachedCatalog = null;
}

function categoriesOf(raw: RawToolkit): string[] {
  const list = raw.meta?.categories ?? raw.categories ?? [];
  return list
    .map((c) => (typeof c === "string" ? c : (c.slug ?? c.name ?? "")))
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
}

function normalize(raw: RawToolkit): ComposioApp | null {
  const slug = raw.slug ?? raw.key;
  if (!slug || !raw.name) return null;
  return {
    key: slug.toLowerCase(),
    name: raw.name,
    description: raw.meta?.description ?? raw.description ?? "",
    logo: raw.meta?.logo ?? raw.logo ?? "",
    categories: categoriesOf(raw),
    noAuth: Boolean(raw.noAuth) || raw.authConfig?.authScheme === "no_auth",
  };
}

export async function listAvailableApps(opts: { force?: boolean } = {}): Promise<ComposioApp[]> {
  if (!isComposioConfigured()) return [];

  const now = Date.now();
  if (!opts.force && cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.apps;
  }

  const composio = await getComposio();
  if (!composio) return [];

  try {
    const raw = (await composio.toolkits.list()) as { items?: RawToolkit[] } | RawToolkit[];
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);
    const apps = items
      .map(normalize)
      .filter((a): a is ComposioApp => a !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    cachedCatalog = { apps, expiresAt: now + CATALOG_TTL_MS };
    return apps;
  } catch (err) {
    console.error("[Composio/Toolkits] list failed:", err);
    return [];
  }
}
