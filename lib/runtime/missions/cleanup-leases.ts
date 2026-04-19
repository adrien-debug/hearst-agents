/**
 * Lease Cleanup — deletes expired mission_run:* lease rows.
 *
 * Does NOT touch the active scheduler_leader row.
 * Safe to call periodically from the heartbeat loop.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export async function cleanupExpiredSchedulerLeases(): Promise<{ deleted: number }> {
  const sb = db();
  if (!sb) return { deleted: 0 };

  try {
    const now = new Date().toISOString();

    const { data, error } = await sb
      .from("scheduler_leases")
      .delete()
      .like("key", "mission_run:%")
      .lt("expires_at", now)
      .select("key");

    if (error) {
      console.error("[LeaseCleanup] Error:", error.message);
      return { deleted: 0 };
    }

    return { deleted: data?.length ?? 0 };
  } catch (err) {
    console.error("[LeaseCleanup] Exception:", err);
    return { deleted: 0 };
  }
}
