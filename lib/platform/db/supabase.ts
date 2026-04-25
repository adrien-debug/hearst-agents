/**
 * Supabase Client — Architecture Finale
 *
 * Server-side Supabase client with types.
 * Path: lib/platform/db/supabase.ts
 * Re-exports from lib/supabase-server.ts for architecture alignment.
 */

export {
  getServerSupabase,
  requireServerSupabase,
} from "../../supabase-server";

export type { SupabaseClient } from "@supabase/supabase-js";
export type { Database } from "../../database.types";
