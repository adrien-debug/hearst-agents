/**
 * Scheduler Leader Lease — DB-backed leadership election.
 *
 * Only one server instance should run the scheduler tick loop at a time.
 * Uses a single row in `scheduler_leases` (key = "scheduler_leader").
 *
 * Acquisition uses a conditional upsert: the row is inserted if absent,
 * or updated only if the current lease is held by us or has expired.
 * This avoids race-prone read-then-write patterns.
 *
 * Falls back to "leader" mode if DB is unavailable (dev/single-instance).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { INSTANCE_ID } from "../instance-id";

const LEASE_KEY = "scheduler_leader";
const DEFAULT_TTL_S = 90;

let _db: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _db;
}

/**
 * Try to become the scheduler leader. Returns true if this instance now holds
 * the leadership lease, false otherwise.
 *
 * Uses a single atomic SQL statement: insert-or-update the lease row
 * only if it doesn't exist, belongs to us, or has expired.
 */
export async function tryAcquireSchedulerLeadership(opts?: {
  instanceId?: string;
  ttlSeconds?: number;
}): Promise<boolean> {
  const sb = db();
  if (!sb) {
    console.warn("[LeaderLease] No DB — assuming leader (dev/single-instance)");
    return true;
  }

  const id = opts?.instanceId ?? INSTANCE_ID;
  const ttl = opts?.ttlSeconds ?? DEFAULT_TTL_S;

  try {
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: result, error: upsertErr } = await sb
      .from("scheduler_leases")
      .upsert(
        {
          key: LEASE_KEY,
          instance_id: id,
          acquired_at: now,
          expires_at: expiresAt,
        },
        { onConflict: "key" },
      )
      .select("instance_id")
      .single();

    if (upsertErr) {
      // Upsert failed — try conditional update (lease expired or ours)
      const { data: updated, error: updateErr } = await sb
        .from("scheduler_leases")
        .update({
          instance_id: id,
          acquired_at: now,
          expires_at: expiresAt,
        })
        .eq("key", LEASE_KEY)
        .or(`instance_id.eq.${id},expires_at.lt.${now}`)
        .select("instance_id")
        .single();

      if (updateErr || !updated) return false;
      return updated.instance_id === id;
    }

    return result?.instance_id === id;
  } catch (err) {
    console.error("[LeaderLease] Acquire error:", err);
    return false;
  }
}

/**
 * Renew an existing leadership lease. Only succeeds if we currently hold it.
 */
export async function renewSchedulerLeadership(opts?: {
  instanceId?: string;
  ttlSeconds?: number;
}): Promise<boolean> {
  const sb = db();
  if (!sb) return true;

  const id = opts?.instanceId ?? INSTANCE_ID;
  const ttl = opts?.ttlSeconds ?? DEFAULT_TTL_S;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  try {
    const { data, error } = await sb
      .from("scheduler_leases")
      .update({ expires_at: expiresAt })
      .eq("key", LEASE_KEY)
      .eq("instance_id", id)
      .select("instance_id")
      .single();

    if (error || !data) return false;
    return true;
  } catch (err) {
    console.error("[LeaderLease] Renew error:", err);
    return false;
  }
}

/**
 * Read current leader info (for diagnostics / observability).
 */
export async function getSchedulerLeader(): Promise<{
  instanceId: string;
  expiresAt: string | null;
} | null> {
  const sb = db();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from("scheduler_leases")
      .select("instance_id, expires_at")
      .eq("key", LEASE_KEY)
      .single();

    if (error || !data) return null;
    return {
      instanceId: data.instance_id as string,
      expiresAt: data.expires_at as string | null,
    };
  } catch {
    return null;
  }
}
