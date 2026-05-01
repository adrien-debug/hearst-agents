/**
 * Watchlist snapshots — historisation des KPIs cockpit (vague 9, action #3).
 *
 * À chaque rafraîchissement de la watchlist, on persiste un snapshot par
 * métrique. L'historique sert ensuite à :
 *  - calculer l'écart vs baseline 7j
 *  - déclencher une narration causale quand l'écart dépasse un seuil
 *
 * Append-only, fail-soft : un échec d'INSERT ne casse pas le rendu cockpit.
 *
 * Déduplication : on n'insère pas un snapshot s'il y en a déjà un dans la
 * dernière heure pour la même métrique (évite de saturer la table à chaque
 * mount du cockpit).
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";

export interface MetricSnapshot {
  id: string;
  userId: string;
  tenantId: string;
  metricId: string;
  value: number;
  capturedAt: number;
  metadata: Record<string, unknown>;
}

const DEDUP_WINDOW_MS = 60 * 60_000; // 1h

interface SupabaseRow {
  id: string;
  user_id: string;
  tenant_id: string;
  metric_id: string;
  value: number;
  captured_at: string;
  metadata: Record<string, unknown> | null;
}

function rowToSnapshot(row: SupabaseRow): MetricSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    metricId: row.metric_id,
    value: Number(row.value),
    capturedAt: new Date(row.captured_at).getTime(),
    metadata: row.metadata ?? {},
  };
}

/**
 * Persiste un snapshot pour une métrique. Fire-and-forget — n'attend pas
 * que l'INSERT termine côté caller.
 *
 * Retourne true si le snapshot a été inséré, false si dédupliqué (un autre
 * snapshot existe < 1h).
 */
export async function recordMetricSnapshot(opts: {
  userId: string;
  tenantId: string;
  metricId: string;
  value: number;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const sb = getServerSupabase();
  if (!sb) return false;

  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  try {
    const { data, error } = await (sb as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                gte: (c: string, v: string) => {
                  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          };
        };
      };
    })
      .from("metric_snapshots")
      .select("id")
      .eq("user_id", opts.userId)
      .eq("tenant_id", opts.tenantId)
      .eq("metric_id", opts.metricId)
      .gte("captured_at", since)
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      return false; // dédupliqué
    }

    const insertRes = await (sb as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    })
      .from("metric_snapshots")
      .insert({
        user_id: opts.userId,
        tenant_id: opts.tenantId,
        metric_id: opts.metricId,
        value: opts.value,
        metadata: opts.metadata ?? {},
      });

    if (insertRes.error) {
      console.warn(
        "[watchlist/snapshots] insert error:",
        (insertRes.error as { message?: string }).message ?? insertRes.error,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[watchlist/snapshots] recordMetricSnapshot exception:", err);
    return false;
  }
}

/**
 * Charge les N derniers snapshots d'une métrique pour ce user (DESC par date).
 */
export async function getRecentSnapshots(opts: {
  userId: string;
  tenantId: string;
  metricId: string;
  /** Cap nombre de snapshots remontés (default 30, max 200). */
  limit?: number;
}): Promise<MetricSnapshot[]> {
  const sb = getServerSupabase();
  if (!sb) return [];

  const limit = Math.max(1, Math.min(opts.limit ?? 30, 200));

  try {
    const { data, error } = await (sb as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                order: (c: string, opts: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
                };
              };
            };
          };
        };
      };
    })
      .from("metric_snapshots")
      .select("id, user_id, tenant_id, metric_id, value, captured_at, metadata")
      .eq("user_id", opts.userId)
      .eq("tenant_id", opts.tenantId)
      .eq("metric_id", opts.metricId)
      .order("captured_at", { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data)) return [];
    return (data as SupabaseRow[]).map(rowToSnapshot);
  } catch (err) {
    console.warn("[watchlist/snapshots] getRecentSnapshots exception:", err);
    return [];
  }
}

// ── Anomaly detection ────────────────────────────────────────

export interface MetricAnomaly {
  /** ID de la métrique concernée. */
  metricId: string;
  /** Valeur courante (la dernière captée). */
  currentValue: number;
  /** Valeur baseline (moyenne ou médiane des N jours précédents). */
  baselineValue: number;
  /** Variation en pourcentage (positive ou négative). */
  changePct: number;
  /** Direction : up | down — facilite le UI styling. */
  direction: "up" | "down";
  /** Période sur laquelle la baseline a été calculée (jours). */
  windowDays: number;
  /** Sévérité héuristique : warning si |changePct| ≥ 5%, critical si ≥ 15%. */
  severity: "warning" | "critical";
}

/** Seuil minimum de variation pour considérer une anomalie. */
const ANOMALY_THRESHOLD_PCT = 5;
const CRITICAL_THRESHOLD_PCT = 15;

/**
 * Calcule une anomaly à partir d'une série de snapshots (DESC par date).
 * Retourne null si :
 *  - moins de 2 points (pas d'historique)
 *  - variation < ANOMALY_THRESHOLD_PCT
 *  - baseline = 0 (division impossible, et un MRR de 0 qui passe à 100 n'est
 *    pas une "anomalie" mais un démarrage)
 */
export function detectAnomaly(
  snapshots: MetricSnapshot[],
  opts: { windowDays?: number } = {},
): MetricAnomaly | null {
  if (snapshots.length < 2) return null;

  const windowDays = opts.windowDays ?? 7;
  const cutoff = Date.now() - windowDays * 24 * 3600_000;

  const current = snapshots[0]; // le plus récent (ordre DESC)
  const baselineValues = snapshots
    .slice(1)
    .filter((s) => s.capturedAt >= cutoff)
    .map((s) => s.value);

  if (baselineValues.length === 0) return null;

  const baseline =
    baselineValues.reduce((acc, v) => acc + v, 0) / baselineValues.length;
  if (baseline === 0) return null;

  const changePct = ((current.value - baseline) / baseline) * 100;
  if (Math.abs(changePct) < ANOMALY_THRESHOLD_PCT) return null;

  return {
    metricId: current.metricId,
    currentValue: current.value,
    baselineValue: baseline,
    changePct,
    direction: changePct > 0 ? "up" : "down",
    windowDays,
    severity:
      Math.abs(changePct) >= CRITICAL_THRESHOLD_PCT ? "critical" : "warning",
  };
}
