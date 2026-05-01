/**
 * report_comments — store Supabase + validation Zod.
 *
 * Tenant isolation : toutes les opérations exigent un `tenantId` explicite et
 * vérifient que la row appartient bien au tenant. La RLS Postgres est la
 * dernière ligne de défense (cf migration 0037), mais on ceinture+bretelle
 * côté code parce que le service_role bypass la RLS.
 *
 * Pas de cache in-memory : commentaires = écriture rare, lecture rare,
 * cohérence > performance (un comment posté doit apparaître immédiatement
 * pour les autres viewers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getServerSupabase } from "@/lib/platform/db/supabase";

// ── Types & schemas ──────────────────────────────────────────

export interface ReportComment {
  id: string;
  assetId: string;
  tenantId: string;
  userId: string;
  /** null = commentaire global, sinon id du block annoté. */
  blockRef: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export const addCommentInputSchema = z.object({
  assetId: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(120),
  userId: z.string().min(1).max(120),
  blockRef: z.string().min(1).max(120).nullable().default(null),
  body: z.string().min(1).max(4000),
});
export type AddCommentInput = z.infer<typeof addCommentInputSchema>;

export const listCommentsInputSchema = z.object({
  assetId: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(120),
  blockRef: z.string().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});
export type ListCommentsInput = z.infer<typeof listCommentsInputSchema>;

export const deleteCommentInputSchema = z.object({
  commentId: z.string().min(1).max(120),
  userId: z.string().min(1).max(120),
  tenantId: z.string().min(1).max(120),
});
export type DeleteCommentInput = z.infer<typeof deleteCommentInputSchema>;

// ── Row mapping ──────────────────────────────────────────────

interface ReportCommentRow {
  id: string;
  asset_id: string;
  tenant_id: string;
  user_id: string;
  block_ref: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

function rowToComment(row: ReportCommentRow): ReportComment {
  return {
    id: row.id,
    assetId: row.asset_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    blockRef: row.block_ref,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function getClient(client?: SupabaseClient): SupabaseClient | null {
  return client ?? (getServerSupabase() as SupabaseClient | null);
}

// ── API ──────────────────────────────────────────────────────

/**
 * Ajoute un commentaire. Retourne le row inséré, ou `null` si Supabase est
 * indispo (mode dev sans env). Throw sur input invalide (Zod).
 */
export async function addComment(
  rawInput: AddCommentInput,
  client?: SupabaseClient,
): Promise<ReportComment | null> {
  const input = addCommentInputSchema.parse(rawInput);
  const sb = getClient(client);
  if (!sb) return null;

  const now = new Date().toISOString();
  const { error } = await sb
    .from("report_comments")
    .insert({
      asset_id: input.assetId,
      tenant_id: input.tenantId,
      user_id: input.userId,
      block_ref: input.blockRef,
      body: input.body,
    });

  if (error) {
    console.error("[comments] insert error:", error.message);
    return null;
  }

  // Supabase insert sans .select() retourne null en data — on relit la row via select.
  const { data: rows, error: fetchErr } = await sb
    .from("report_comments")
    .select("id, asset_id, tenant_id, user_id, block_ref, body, created_at, updated_at")
    .eq("asset_id", input.assetId)
    .eq("tenant_id", input.tenantId)
    .eq("user_id", input.userId)
    .eq("body", input.body)
    .order("created_at", { ascending: false })
    .limit(1);

  void now; // utilisé implicitement via new Date() ci-dessus
  if (fetchErr || !rows || rows.length === 0) return null;
  return rowToComment((rows as ReportCommentRow[])[0]);
}

/**
 * Liste les commentaires d'un asset, scopés au tenant. Le filtre tenant est
 * passé explicitement à la query — on ne se repose pas uniquement sur la RLS.
 * Optionnel `blockRef` pour ne charger que les commentaires d'un bloc précis.
 */
export async function listComments(
  rawInput: ListCommentsInput,
  client?: SupabaseClient,
): Promise<ReportComment[]> {
  const input = listCommentsInputSchema.parse(rawInput);
  const sb = getClient(client);
  if (!sb) return [];

  let query = sb
    .from("report_comments")
    .select("*")
    .eq("asset_id", input.assetId)
    .eq("tenant_id", input.tenantId)
    .order("created_at", { ascending: true })
    .limit(input.limit);

  if (input.blockRef !== undefined) {
    query = query.eq("block_ref", input.blockRef);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[comments] list error:", error.message);
    return [];
  }
  return ((data as ReportCommentRow[]) ?? []).map(rowToComment);
}

export type DeleteCommentOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" | "supabase_unavailable" | "delete_failed" };

/**
 * Supprime un commentaire. Strict ownership : seul l'auteur (userId) peut
 * supprimer son commentaire (le service_role bypass RLS si besoin admin).
 * Vérifie aussi le tenant pour défense en profondeur.
 */
export async function deleteComment(
  rawInput: DeleteCommentInput,
  client?: SupabaseClient,
): Promise<DeleteCommentOutcome> {
  const input = deleteCommentInputSchema.parse(rawInput);
  const sb = getClient(client);
  if (!sb) return { ok: false, reason: "supabase_unavailable" };

  // 1. Lookup pour différencier 404 vs 403 (et garder la trace de l'identité tenant)
  const { data: row, error: fetchErr } = await sb
    .from("report_comments")
    .select("id, user_id, tenant_id")
    .eq("id", input.commentId)
    .maybeSingle();
  if (fetchErr) {
    console.error("[comments] fetch-before-delete error:", fetchErr.message);
    return { ok: false, reason: "delete_failed" };
  }
  if (!row) return { ok: false, reason: "not_found" };

  const r = row as { user_id: string; tenant_id: string };
  if (r.tenant_id !== input.tenantId) return { ok: false, reason: "forbidden" };
  if (r.user_id !== input.userId) return { ok: false, reason: "forbidden" };

  // 2. Delete
  const { error: delErr } = await sb
    .from("report_comments")
    .delete()
    .eq("id", input.commentId);
  if (delErr) {
    console.error("[comments] delete error:", delErr.message);
    return { ok: false, reason: "delete_failed" };
  }
  return { ok: true };
}
