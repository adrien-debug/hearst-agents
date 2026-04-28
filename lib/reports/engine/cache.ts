/**
 * Cache 3-tiers pour le moteur de reports.
 *
 *   L1 raw_source_cache    — résultat brut d'un fetch source (clé sha256)
 *   L2 transform_cache     — résultat d'une op de transform (clé sha256)
 *   L3 render_cache        — payload final + narration (spec_id+version+hash)
 *
 * Tables Postgres derrière Supabase (cf. migration 0025_report_cache.sql).
 * Best-effort : si Supabase indispo, dégrade en no-op.
 *
 * NOTE TYPAGE : tant que `lib/database.types.ts` ne contient pas les 3 tables
 * report_*_cache, on cast le client en `any` au point d'entrée. Le shim
 * `cache-types.ts` documente le shape réel et type les rows retournées. À
 * supprimer dès que Supabase types sont régénérés.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import type {
  ReportSourceCacheRow,
  ReportTransformCacheRow,
  ReportRenderCacheRow,
} from "./cache-types";

// ── Hash & key helpers ─────────────────────────────────────

/**
 * Sérialisation déterministe : tri des clés pour que le hash soit stable
 * indépendamment de l'ordre d'insertion dans les params.
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
  return "null";
}

export function hashKey(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

// ── Supabase client (untyped pour les 3 tables hors schema) ──

const TABLE_SOURCE = "report_source_cache";
const TABLE_TRANSFORM = "report_transform_cache";
const TABLE_RENDER = "report_render_cache";

/**
 * Cast unique du client. Le typage strict des rows est restauré par le
 * `cache-types.ts` au point de consommation des résultats.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

function client(): AnyClient | null {
  return getServerSupabase() as unknown as AnyClient | null;
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

// ── L1 — source cache ──────────────────────────────────────

export async function getSourceCache<T = unknown>(hash: string): Promise<T | null> {
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE_SOURCE)
    .select("payload, expires_at")
    .eq("hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Pick<ReportSourceCacheRow, "payload" | "expires_at">;
  if (isExpired(row.expires_at)) return null;
  return row.payload as T;
}

export async function setSourceCache(
  hash: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  const sb = client();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await sb
    .from(TABLE_SOURCE)
    .upsert({ hash, payload, expires_at: expiresAt }, { onConflict: "hash" });
}

// ── L2 — transform cache ───────────────────────────────────

export async function getTransformCache<T = unknown>(
  hash: string,
): Promise<T | null> {
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE_TRANSFORM)
    .select("payload, expires_at")
    .eq("hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Pick<ReportTransformCacheRow, "payload" | "expires_at">;
  if (isExpired(row.expires_at)) return null;
  return row.payload as T;
}

export async function setTransformCache(
  hash: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  const sb = client();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await sb
    .from(TABLE_TRANSFORM)
    .upsert({ hash, payload, expires_at: expiresAt }, { onConflict: "hash" });
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
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE_RENDER)
    .select("payload_json, narration, expires_at")
    .eq("spec_id", key.specId)
    .eq("version", key.version)
    .eq("payload_hash", key.payloadHash)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Pick<
    ReportRenderCacheRow,
    "payload_json" | "narration" | "expires_at"
  >;
  if (isExpired(row.expires_at)) return null;
  return { payload: row.payload_json, narration: row.narration ?? null };
}

export async function setRenderCache(
  key: RenderCacheKey,
  value: RenderCacheValue,
  ttlSeconds: number,
): Promise<void> {
  const sb = client();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await sb.from(TABLE_RENDER).upsert(
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
  const sb = client();
  if (!sb) return { source: 0, transform: 0, render: 0 };
  const now = new Date().toISOString();
  const [a, b, c] = await Promise.all([
    sb.from(TABLE_SOURCE).delete().lt("expires_at", now).select("hash"),
    sb.from(TABLE_TRANSFORM).delete().lt("expires_at", now).select("hash"),
    sb.from(TABLE_RENDER).delete().lt("expires_at", now).select("spec_id"),
  ]);
  return {
    source: (a.data as Array<unknown> | null)?.length ?? 0,
    transform: (b.data as Array<unknown> | null)?.length ?? 0,
    render: (c.data as Array<unknown> | null)?.length ?? 0,
  };
}
