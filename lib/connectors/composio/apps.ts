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
  /**
   * `true` si une auth-config existe pour ce toolkit côté tenant Composio
   * (managed ou custom) — l'utilisateur peut donc déclencher un OAuth.
   * `false` sinon : Composio refusera la connexion (NO_INTEGRATION),
   * il faut d'abord configurer une auth-config sur app.composio.dev.
   */
  connectable: boolean;
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

function normalize(raw: RawApiItem): Omit<ComposioApp, "connectable"> | null {
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

// Récupère l'ensemble des slugs de toolkits qui ont au moins une auth-config
// côté tenant Composio (managed ou custom). Sert à marquer les apps comme
// `connectable: true|false` dans le catalogue. Pagination native de
// authConfigs.list (contrairement à toolkits.get qui drop le cursor).
interface RawAuthConfig {
  toolkit?: { slug?: string };
  toolkitSlug?: string;
}
interface RawAuthConfigPage {
  items?: RawAuthConfig[];
  nextCursor?: string | null;
}
interface ComposioAuthConfigsModule {
  list: (params: Record<string, unknown>) => Promise<RawAuthConfigPage>;
}

async function fetchConfiguredToolkitSlugs(
  composio: unknown,
): Promise<Set<string>> {
  const set = new Set<string>();
  const authConfigs = (composio as { authConfigs?: ComposioAuthConfigsModule })
    .authConfigs;
  if (!authConfigs?.list) return set;
  let cursor: string | undefined;
  const MAX_PAGES = 30;
  for (let i = 0; i < MAX_PAGES; i++) {
    const query: Record<string, unknown> = { limit: 100 };
    if (cursor) query.cursor = cursor;
    let page: RawAuthConfigPage;
    try {
      page = await authConfigs.list(query);
    } catch (err) {
      console.warn("[Composio/Toolkits] authConfigs.list failed:", err);
      break;
    }
    for (const ac of page.items ?? []) {
      const slug = ac.toolkit?.slug ?? ac.toolkitSlug;
      if (slug) set.add(slug.toLowerCase());
    }
    const next = page.nextCursor ?? null;
    if (!next) break;
    cursor = next;
  }
  return set;
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

    // Catalogue + auth-configs en parallèle. Le set des configured permet
    // de marquer chaque app comme connectable ou pas — l'UI grise les
    // non-connectables et adapte le bouton du drawer.
    const configuredSlugs = await fetchConfiguredToolkitSlugs(composio);

    const apps = all
      .map(normalize)
      .filter((a): a is Omit<ComposioApp, "connectable"> => a !== null)
      .map((a): ComposioApp => ({
        ...a,
        connectable: a.noAuth || configuredSlugs.has(a.key),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cachedCatalog = { apps, expiresAt: now + CATALOG_TTL_MS };
    return apps;
  } catch (err) {
    console.error("[Composio/Toolkits] list failed:", err);
    return [];
  }
}
