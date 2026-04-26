import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

let _client: SupabaseClient<Database> | null = null;

export function getServerSupabase(): SupabaseClient<Database> | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  _client = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _client;
}

export function requireServerSupabase(): SupabaseClient<Database> {
  const sb = getServerSupabase();
  if (!sb) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return sb;
}

export type { SupabaseClient };
export type { Database };
