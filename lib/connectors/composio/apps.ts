/**
 * Composio Toolkits catalog — list available toolkits (= "apps") +
 * per-toolkit metadata.
 *
 * The new SDK calls these "toolkits" but the public type stays
 * `ComposioApp` to avoid a UI-wide rename. Cached process-wide for 30 min
 * (catalog is global, not per-user).
 *
 * Pagination note: `composio.toolkits.get()` wraps a single HTTP call and
 * silently drops the cursor, making full catalog retrieval impossible.
 * We reach into the raw underlying HTTP client (`toolkits.client.toolkits.list`)
 * which returns `{ items, next_cursor }` and paginate correctly.
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

// Raw item as returned by GET /api/v3/toolkits (snake_case from the API).
interface RawApiItem {
  slug?: string;
  name?: string;
  meta?: {
    description?: string;
    logo?: string;
    // Raw API uses `id` for category slug; SDK transforms it to `slug`.
    categories?: Array<string | { id?: string; slug?: string; name?: string }>;
  };
  // SDK-transformed (camelCase) fallbacks — accepted for flexibility.
  key?: string;
  description?: string;
  logo?: string;
  categories?: Array<string | { id?: string; slug?: string; name?: string }>;
  no_auth?: boolean;
  noAuth?: boolean;
  auth_schemes?: string[];
  authSchemes?: string[];
  authConfig?: { authScheme?: string };
}

interface RawApiPage {
  items?: RawApiItem[];
  next_cursor?: string | null;
}

// The underlying raw HTTP client exposed by @composio/core ≥ 0.6.
interface RawHttpClient {
  toolkits: {
    list: (params: Record<string, unknown>) => Promise<RawApiPage>;
  };
}

const CATALOG_TTL_MS = 30 * 60_000;
let cachedCatalog: { apps: ComposioApp[]; expiresAt: number } | null = null;

export function resetAppsCache(): void {
  cachedCatalog = null;
}

function categoriesOf(raw: RawApiItem): string[] {
  const list = raw.meta?.categories ?? raw.categories ?? [];
  return list
    .map((c) =>
      typeof c === "string"
        ? c
        : // Raw API → id; SDK-transformed → slug; fallback → name
          (c.id ?? c.slug ?? c.name ?? ""),
    )
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
}

function normalize(raw: RawApiItem): ComposioApp | null {
  const slug = raw.slug ?? raw.key;
  if (!slug || !raw.name) return null;
  const noAuth =
    Boolean(raw.no_auth ?? raw.noAuth) ||
    raw.authConfig?.authScheme === "no_auth";
  return {
    key: slug.toLowerCase(),
    name: raw.name,
    description: raw.meta?.description ?? raw.description ?? "",
    logo: raw.meta?.logo ?? raw.logo ?? "",
    categories: categoriesOf(raw),
    noAuth,
  };
}

export async function listAvailableApps(
  opts: { force?: boolean } = {},
): Promise<ComposioApp[]> {
  if (!isComposioConfigured()) return [];

  const now = Date.now();
  if (!opts.force && cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.apps;
  }

  const composio = await getComposio();
  if (!composio) return [];

  // `composio.toolkits.get()` is the correct high-level method but it only
  // makes one API call and discards the pagination cursor.  We access the
  // raw HTTP client directly — it is a stable, explicitly-exposed property
  // on the Toolkits class instance.
  const rawHttp = (
    composio.toolkits as unknown as { client: RawHttpClient }
  ).client;

  try {
    const all: RawApiItem[] = [];
    let cursor: string | undefined;
    const MAX_PAGES = 20;

    for (let i = 0; i < MAX_PAGES; i++) {
      const query: Record<string, unknown> = { limit: 100 };
      if (cursor) query.cursor = cursor;
      const page = await rawHttp.toolkits.list(query);
      all.push(...(page.items ?? []));
      const next = page.next_cursor ?? null;
      if (!next) break;
      cursor = next;
    }

    const apps = all
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
