/**
 * User resolver — Email → UUID via public.users avec auto-provisioning.
 *
 * Appelé par le callback NextAuth jwt() au premier login (et à chaque
 * refresh OAuth). UPSERT sur (email) avec RETURNING id pour récupérer
 * l'UUID atomic (DO UPDATE SET email = EXCLUDED.email contourne la
 * limitation ON CONFLICT DO NOTHING + RETURNING ne renvoie rien sur
 * conflit).
 *
 * Prérequis schéma : public.users (id uuid PK default gen_random_uuid(),
 *                                  email text UNIQUE).
 *
 * Sans Supabase service role (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY) : retourne null. Le callback NextAuth log
 * un warning et token.userId reste undefined → user pas authentifié pour
 * les routes auth-required.
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawDb(sb: ReturnType<typeof getServerSupabase>): SupabaseClient<any> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as SupabaseClient<any> | null;
}

export async function resolveOrCreateUserUuid(email: string): Promise<string | null> {
  if (!email) return null;
  const sb = getServerSupabase();
  if (!sb) {
    console.warn("[UserResolver] Supabase service role not configured");
    return null;
  }

  // UPSERT pattern qui RENVOIE l'id même si le row existait déjà.
  // `onConflict: "email"` + `ignoreDuplicates: false` forcent un retour
  // de la row existante au lieu d'un null silencieux.
  const { data, error } = await rawDb(sb)!
    .from("users")
    .upsert({ email }, { onConflict: "email", ignoreDuplicates: false })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[UserResolver] upsert public.users failed:", error?.message);
    return null;
  }

  return (data as { id: string }).id;
}

