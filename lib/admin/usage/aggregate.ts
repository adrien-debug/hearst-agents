/**
 * Cross-tenant usage aggregation (C6).
 *
 * Source de vérité : `runs` (cost_usd, tokens_in, tokens_out, kind, user_id,
 * tenant_id, created_at), `assets` et `missions`. La colonne `tenant_id`
 * directe (migration 0051) est privilégiée. Pour les runs historiques où
 * `tenant_id IS NULL`, on retombe sur l'heuristique `users.tenant_ids[0]`.
 *
 * Toutes les fonctions sont fail-soft : si Supabase est indisponible ou
 * qu'une requête échoue, on renvoie un payload vide cohérent.
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";

export interface DateRange {
  start: string; // ISO
  end: string; // ISO (exclusive)
}

export type Granularity = "day" | "week" | "month";

export interface TenantUsage {
  tenantId: string;
  totalRuns: number;
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalMissions: number;
  totalAssets: number;
  activeUsers: number;
}

export interface TimeSeriesPoint {
  bucket: string; // ISO du début du bucket
  runs: number;
  costUsd: number;
}

export interface UsageOverview {
  totalRuns: number;
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalMissions: number;
  totalAssets: number;
  totalActiveUsers: number;
  totalTenants: number;
}

export const DEFAULT_LOOKBACK_DAYS = 30;

export function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function defaultDateRange(): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
  start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function bucketStartIso(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === "month") {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return m.toISOString();
  }
  if (granularity === "week") {
    // Lundi (ISO week start) à 00:00 UTC
    const day = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
    const w = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
    return w.toISOString();
  }
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return dd.toISOString();
}

interface RunRow {
  user_id: string | null;
  tenant_id?: string | null;
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  kind?: string | null;
}

interface UserTenantRow {
  id: string;
  tenant_ids: string[] | null;
}

async function loadUserTenantMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const db = getServerSupabase();
  if (!db) return map;
  const { data, error } = await db
    .from("users")
    .select("id, tenant_ids");
  if (error || !data) return map;
  for (const row of data as UserTenantRow[]) {
    const t = row.tenant_ids?.[0];
    if (t) map.set(row.id, t);
  }
  return map;
}

async function loadRuns(range: DateRange, kindFilter?: string | null): Promise<RunRow[]> {
  const db = getServerSupabase();
  if (!db) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db
    .from("runs")
    .select("user_id, tenant_id, cost_usd, tokens_in, tokens_out, created_at, kind")
    .gte("created_at", range.start)
    .lt("created_at", range.end);
  if (kindFilter && kindFilter.length > 0) {
    q = q.eq("kind", kindFilter);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data as RunRow[];
}

interface MissionRow {
  user_id: string | null;
  created_at: string;
}

async function loadMissions(range: DateRange): Promise<MissionRow[]> {
  const db = getServerSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("missions")
    .select("user_id, created_at")
    .gte("created_at", range.start)
    .lt("created_at", range.end);
  if (error || !data) return [];
  return data as MissionRow[];
}

interface AssetRow {
  thread_id: string;
  created_at: string;
  provenance: { tenantId?: string; userId?: string } | null;
}

async function loadAssets(range: DateRange): Promise<AssetRow[]> {
  const db = getServerSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("assets")
    .select("thread_id, created_at, provenance")
    .gte("created_at", range.start)
    .lt("created_at", range.end);
  if (error || !data) return [];
  return data as unknown as AssetRow[];
}

function tenantOf(userId: string | null, map: Map<string, string>): string {
  if (!userId) return "unknown";
  return map.get(userId) ?? "unknown";
}

/**
 * Préfère `runs.tenant_id` direct (migration 0051) ; fallback sur
 * l'heuristique `users.tenant_ids[0]` pour les runs antérieurs au backfill.
 */
function tenantOfRun(run: RunRow, map: Map<string, string>): string {
  const direct = run.tenant_id?.trim();
  if (direct && direct.length > 0) return direct;
  return tenantOf(run.user_id, map);
}

export async function getCrossTenantOverview(
  range: DateRange = defaultDateRange(),
  kindFilter: string | null = null,
): Promise<UsageOverview> {
  const [runs, missions, assets, userMap] = await Promise.all([
    loadRuns(range, kindFilter),
    loadMissions(range),
    loadAssets(range),
    loadUserTenantMap(),
  ]);

  const tenants = new Set<string>();
  const activeUsers = new Set<string>();
  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const r of runs) {
    const t = tenantOfRun(r, userMap);
    tenants.add(t);
    if (r.user_id) activeUsers.add(r.user_id);
    totalCost += Number(r.cost_usd ?? 0);
    totalTokensIn += Number(r.tokens_in ?? 0);
    totalTokensOut += Number(r.tokens_out ?? 0);
  }

  return {
    totalRuns: runs.length,
    totalCostUsd: round4(totalCost),
    totalTokensIn,
    totalTokensOut,
    totalMissions: missions.length,
    totalAssets: assets.length,
    totalActiveUsers: activeUsers.size,
    totalTenants: tenants.size,
  };
}

export async function getTopTenants(
  range: DateRange = defaultDateRange(),
  limit = 10,
  kindFilter: string | null = null,
): Promise<TenantUsage[]> {
  const [runs, missions, assets, userMap] = await Promise.all([
    loadRuns(range, kindFilter),
    loadMissions(range),
    loadAssets(range),
    loadUserTenantMap(),
  ]);

  const usagePerTenant = new Map<string, TenantUsage>();
  const usersPerTenant = new Map<string, Set<string>>();

  function ensure(tenantId: string): TenantUsage {
    let u = usagePerTenant.get(tenantId);
    if (!u) {
      u = {
        tenantId,
        totalRuns: 0,
        totalCostUsd: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalMissions: 0,
        totalAssets: 0,
        activeUsers: 0,
      };
      usagePerTenant.set(tenantId, u);
      usersPerTenant.set(tenantId, new Set());
    }
    return u;
  }

  for (const r of runs) {
    const t = tenantOfRun(r, userMap);
    const u = ensure(t);
    u.totalRuns += 1;
    u.totalCostUsd += Number(r.cost_usd ?? 0);
    u.totalTokensIn += Number(r.tokens_in ?? 0);
    u.totalTokensOut += Number(r.tokens_out ?? 0);
    if (r.user_id) usersPerTenant.get(t)?.add(r.user_id);
  }

  for (const m of missions) {
    const t = tenantOf(m.user_id, userMap);
    ensure(t).totalMissions += 1;
  }

  for (const a of assets) {
    const t = a.provenance?.tenantId ?? tenantOf(a.provenance?.userId ?? null, userMap);
    ensure(t).totalAssets += 1;
  }

  for (const [t, set] of usersPerTenant.entries()) {
    const u = usagePerTenant.get(t);
    if (u) u.activeUsers = set.size;
  }

  const list = [...usagePerTenant.values()].map((u) => ({
    ...u,
    totalCostUsd: round4(u.totalCostUsd),
  }));
  list.sort((a, b) => b.totalCostUsd - a.totalCostUsd || b.totalRuns - a.totalRuns);
  return list.slice(0, limit);
}

export async function getTenantUsage(
  tenantId: string,
  range: DateRange = defaultDateRange(),
  kindFilter: string | null = null,
): Promise<TenantUsage & { users: Array<{ userId: string; runs: number; costUsd: number }> }> {
  const [runs, missions, assets, userMap] = await Promise.all([
    loadRuns(range, kindFilter),
    loadMissions(range),
    loadAssets(range),
    loadUserTenantMap(),
  ]);

  const usage: TenantUsage = {
    tenantId,
    totalRuns: 0,
    totalCostUsd: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalMissions: 0,
    totalAssets: 0,
    activeUsers: 0,
  };
  const userAgg = new Map<string, { runs: number; costUsd: number }>();

  for (const r of runs) {
    if (tenantOf(r.user_id, userMap) !== tenantId) continue;
    usage.totalRuns += 1;
    usage.totalCostUsd += Number(r.cost_usd ?? 0);
    usage.totalTokensIn += Number(r.tokens_in ?? 0);
    usage.totalTokensOut += Number(r.tokens_out ?? 0);
    if (r.user_id) {
      const e = userAgg.get(r.user_id) ?? { runs: 0, costUsd: 0 };
      e.runs += 1;
      e.costUsd += Number(r.cost_usd ?? 0);
      userAgg.set(r.user_id, e);
    }
  }

  for (const m of missions) {
    if (tenantOf(m.user_id, userMap) !== tenantId) continue;
    usage.totalMissions += 1;
  }
  for (const a of assets) {
    const t = a.provenance?.tenantId ?? tenantOf(a.provenance?.userId ?? null, userMap);
    if (t !== tenantId) continue;
    usage.totalAssets += 1;
  }
  usage.activeUsers = userAgg.size;
  usage.totalCostUsd = round4(usage.totalCostUsd);

  const users = [...userAgg.entries()]
    .map(([userId, v]) => ({ userId, runs: v.runs, costUsd: round4(v.costUsd) }))
    .sort((a, b) => b.costUsd - a.costUsd || b.runs - a.runs)
    .slice(0, 50);

  return { ...usage, users };
}

export async function getCrossTenantTimeSeries(
  range: DateRange = defaultDateRange(),
  granularity: Granularity = "day",
  kindFilter: string | null = null,
): Promise<TimeSeriesPoint[]> {
  const runs = await loadRuns(range, kindFilter);
  const buckets = new Map<string, { runs: number; costUsd: number }>();

  for (const r of runs) {
    const key = bucketStartIso(r.created_at, granularity);
    const e = buckets.get(key) ?? { runs: 0, costUsd: 0 };
    e.runs += 1;
    e.costUsd += Number(r.cost_usd ?? 0);
    buckets.set(key, e);
  }

  return [...buckets.entries()]
    .map(([bucket, v]) => ({ bucket, runs: v.runs, costUsd: round4(v.costUsd) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
