import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { createModelProfileSchema, ok, err, parseBody, dbErr } from "@/lib/domain";
import type { Database } from "@/lib/database.types";

type ProfileInsert = Database["public"]["Tables"]["model_profiles"]["Insert"];

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("model_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return dbErr("GET /api/model-profiles", error);
    return ok({ model_profiles: data ?? [] });
  } catch (e) {
    console.error("GET /api/model-profiles: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(createModelProfileSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("model_profiles")
      .insert(parsed.data as ProfileInsert)
      .select()
      .single();

    if (error) return dbErr("POST /api/model-profiles", error);
    return ok({ model_profile: data }, 201);
  } catch (e) {
    console.error("POST /api/model-profiles: uncaught", e);
    return err("internal_error", 500);
  }
}
