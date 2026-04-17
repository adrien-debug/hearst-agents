/**
 * Change Tracker — audit trail for every decision applied.
 *
 * Records before/after state, actor, signal source, and reason.
 * Read-only history. Never deletes entries.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type DB = SupabaseClient<Database>;

export type ChangeType =
  | "guard_policy"
  | "cost_budget"
  | "model_switch"
  | "tool_config"
  | "agent_config"
  | "prompt_update";

export interface TrackChangeOptions {
  signal_id?: string;
  change_type: ChangeType;
  target_id: string;
  target_type: "agent" | "tool" | "integration" | "workflow" | "model_profile";
  before_value: unknown;
  after_value: unknown;
  actor: string;
  reason?: string;
}

export async function trackChange(
  sb: DB,
  opts: TrackChangeOptions,
): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await sb
    .from("applied_changes")
    .insert({
      signal_id: opts.signal_id ?? null,
      change_type: opts.change_type,
      target_id: opts.target_id,
      target_type: opts.target_type,
      before_value: opts.before_value as Json,
      after_value: opts.after_value as Json,
      actor: opts.actor,
      reason: opts.reason ?? null,
    })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: data?.id ?? null };
}

export async function listChanges(
  sb: DB,
  opts: {
    target_id?: string;
    target_type?: string;
    change_type?: string;
    limit?: number;
  } = {},
) {
  let query = sb
    .from("applied_changes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.target_id) query = query.eq("target_id", opts.target_id);
  if (opts.target_type) query = query.eq("target_type", opts.target_type);
  if (opts.change_type) query = query.eq("change_type", opts.change_type);

  const { data, error } = await query;
  return { data: data ?? [], error };
}
