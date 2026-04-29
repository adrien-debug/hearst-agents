/**
 * report_shares store — wrappers Supabase pour la création/lookup de partages.
 *
 * Les fonctions retournent `null` quand Supabase n'est pas configuré (dev sans
 * env). Les callers (API route) traduisent ça en erreur HTTP.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export interface ReportShareRow {
  id: string;
  asset_id: string;
  tenant_id: string;
  token_hash: string;
  expires_at: string;
  created_by: string | null;
  view_count: number;
  revoked_at: string | null;
  created_at: string;
}

export interface CreateShareInput {
  shareId: string;
  assetId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: string;
  createdBy: string | null;
}

export async function createShareRow(
  input: CreateShareInput,
  client?: SupabaseClient,
): Promise<ReportShareRow | null> {
  const sb = client ?? getServerSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("report_shares")
    .insert({
      id: input.shareId,
      asset_id: input.assetId,
      tenant_id: input.tenantId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) {
    console.error("[sharing] insert error:", error.message);
    return null;
  }
  return data as ReportShareRow;
}

export async function findShareByTokenHash(
  tokenHash: string,
  client?: SupabaseClient,
): Promise<ReportShareRow | null> {
  const sb = client ?? getServerSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("report_shares")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("[sharing] lookup error:", error.message);
    return null;
  }
  return (data as ReportShareRow | null) ?? null;
}

export async function incrementShareViewCount(
  shareId: string,
  client?: SupabaseClient,
): Promise<void> {
  const sb = client ?? getServerSupabase();
  if (!sb) return;

  const { data, error: fetchErr } = await sb
    .from("report_shares")
    .select("view_count")
    .eq("id", shareId)
    .single();
  if (fetchErr || !data) return;

  await sb
    .from("report_shares")
    .update({ view_count: (data.view_count ?? 0) + 1 })
    .eq("id", shareId);
}

export async function revokeShare(
  shareId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const sb = client ?? getServerSupabase();
  if (!sb) return false;

  const { error } = await sb
    .from("report_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);
  return !error;
}
