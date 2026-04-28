/**
 * Cache 3-tiers pour le moteur de reports.
 *
 *   L1 raw_source_cache    — résultat brut d'un fetch source (clé sha256)
 *   L2 transform_cache     — résultat d'une op de transform (clé sha256)
 *   L3 render_cache        — payload final + narration (clé spec_id+version+payload_hash)
 *
 * Tables Postgres derrière Supabase (cf. supabase/migrations/0025_report_cache.sql).
 * Toutes les entrées sont éphémères : `expires_at` btree → cleanup périodique.
 *
 * **Best-effort** : si Supabase n'est pas configuré (pas d'env), les helpers
 * dégradent silencieusement vers no-op (le pipeline continue de fonctionner,
 * juste sans cache).
 */

import { createHash } from "crypto";
import { getServerSupabase } from "@/lib/platform/db/supabase";

// ── Hash & key helpers ─────────────────────────────────────

/**
 * Sérialisation déterministe : tri des clés à chaque niveau pour que le hash
 * soit stable indépendamment de l'ordre d'insertion dans les params.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  // fonctions, symbols → on n'autorise pas
  return "null";
}

export function hashKey(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

// ── Types & TTL ────────────────────────────────────────────

export interface CacheEntry<T = unknown> {
  payload: T;
  expiresAt: number; // ms epoch
}

const TABLE_SOURCE = "report_source_cache";
const TABLE_TRANSFORM = "report_transform_cache";
const TABLE_RENDER = "report_render_cache";

// ── L1 — source cache ──────────────────────────────────────

export async function getSourceCache<T = unknown>(
  hash: string,
): Promise<T | null> {
  const sb = getServerSupabase();
  if (!sb) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from(TABLE_SOURCE) as any)
    .select("payload, expires_at")
    .eq("hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload as T;
}

export async function setSourceCache(
  hash: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  const sb = getServerSupabase();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from(TABLE_SOURCE) as any).upsert(
    { hash, payload, expires_at: expiresAt },
    { onConflict: "hash" },
  );
}

// ── L2 — transform cache ───────────────────────────────────

export async function getTransformCache<T = unknown>(
  hash: string,
): Promise<T | null> {
  const sb = getServerSupabase();
  if (!sb) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from(TABLE_TRANSFORM) as any)
    .select("payload, expires_at")
    .eq("hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload as T;
}

export async function setTransformCache(
  hash: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  const sb = getServerSupabase();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from(TABLE_TRANSFORM) as any).upsert(
    { hash, payload, expires_at: expiresAt },
    { onConflict: "hash" },
  );
}

// ── L3 — render cache ──────────────────────────────────────

export interface RenderCacheKey {
  specId: string;
  version: number;
  payloadHash: string;
}

export interface RenderCacheValue {
  payload: unknown;
  narration: string | null;
}

export async function getRenderCache(
  key: RenderCacheKey,
): Promise<RenderCacheValue | null> {
  const sb = getServerSupabase();
  if (!sb) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from(TABLE_RENDER) as any)
    .select("payload_json, narration, expires_at")
    .eq("spec_id", key.specId)
    .eq("version", key.version)
    .eq("payload_hash", key.payloadHash)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { payload: data.payload_json, narration: data.narration ?? null };
}

export async function setRenderCache(
  key: RenderCacheKey,
  value: RenderCacheValue,
  ttlSeconds: number,
): Promise<void> {
  const sb = getServerSupabase();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from(TABLE_RENDER) as any).upsert(
    {
      spec_id: key.specId,
      version: key.version,
      payload_hash: key.payloadHash,
      payload_json: value.payload,
      narration: value.narration,
      expires_at: expiresAt,
    },
    { onConflict: "spec_id,version,payload_hash" },
  );
}

// ── Cleanup utilitaire (à brancher sur cron) ───────────────

export async function pruneExpired(): Promise<{
  source: number;
  transform: number;
  render: number;
}> {
  const sb = getServerSupabase();
  if (!sb) return { source: 0, transform: 0, render: 0 };
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb2 = sb as any;
  const [a, b, c] = await Promise.all([
    sb2.from(TABLE_SOURCE).delete().lt("expires_at", now).select("hash"),
    sb2.from(TABLE_TRANSFORM).delete().lt("expires_at", now).select("hash"),
    sb2.from(TABLE_RENDER).delete().lt("expires_at", now).select("spec_id"),
  ]);
  return {
    source: a.data?.length ?? 0,
    transform: b.data?.length ?? 0,
    render: c.data?.length ?? 0,
  };
}
