/**
 * Signal Manager — persist, query, and resolve improvement signals.
 *
 * Lifecycle: open → acknowledged → applied | dismissed | expired
 * Deduplication: same kind + target_id + status=open → skip.
 * No auto-apply. All actions are operator-initiated.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import type { FeedbackSignal } from "../analytics/feedback";

type DB = SupabaseClient<Database>;

export type SignalStatus = "open" | "acknowledged" | "applied" | "dismissed" | "expired";

export interface PersistResult {
  created: number;
  skipped_duplicates: number;
}

export async function persistSignals(
  sb: DB,
  signals: FeedbackSignal[],
): Promise<PersistResult> {
  let created = 0;
  let skipped = 0;

  for (const signal of signals) {
    const { data: existing } = await sb
      .from("improvement_signals")
      .select("id")
      .eq("kind", signal.kind)
      .eq("target_id", signal.target_id)
      .eq("status", "open")
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await sb
      .from("improvement_signals")
      .insert({
        kind: signal.kind,
        priority: signal.priority,
        status: "open",
        target_id: signal.target_id,
        target_type: signal.target_type,
        title: signal.title,
        description: signal.description,
        suggestion: signal.suggestion,
        data: signal.data as unknown as Json,
      });

    if (!error) created++;
  }

  return { created, skipped_duplicates: skipped };
}

export async function listSignals(
  sb: DB,
  opts: {
    status?: SignalStatus;
    target_type?: string;
    target_id?: string;
    kind?: string;
    priority?: string;
    limit?: number;
  } = {},
) {
  let query = sb
    .from("improvement_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.target_type) query = query.eq("target_type", opts.target_type);
  if (opts.target_id) query = query.eq("target_id", opts.target_id);
  if (opts.kind) query = query.eq("kind", opts.kind);
  if (opts.priority) query = query.eq("priority", opts.priority);

  const { data, error } = await query;
  return { data: data ?? [], error };
}

export async function resolveSignal(
  sb: DB,
  signalId: string,
  resolution: {
    status: "applied" | "dismissed";
    applied_by?: string;
    resolution_note?: string;
  },
) {
  const { error } = await sb
    .from("improvement_signals")
    .update({
      status: resolution.status,
      resolution: resolution.resolution_note ?? null,
      applied_at: resolution.status === "applied" ? new Date().toISOString() : null,
      applied_by: resolution.status === "applied" ? (resolution.applied_by ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", signalId);

  return { error };
}

export async function acknowledgeSignal(sb: DB, signalId: string) {
  const { error } = await sb
    .from("improvement_signals")
    .update({ status: "acknowledged", updated_at: new Date().toISOString() })
    .eq("id", signalId);

  return { error };
}
