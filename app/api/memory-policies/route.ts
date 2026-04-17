import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err, dbErr } from "@/lib/domain";
import { z } from "zod";
import { parseBody } from "@/lib/domain";

export const dynamic = "force-dynamic";

const createPolicySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  max_entries: z.number().int().min(1).default(1000),
  ttl_seconds: z.number().int().min(60).optional(),
  min_importance: z.number().min(0).max(1).default(0),
  auto_summarize: z.boolean().default(false),
  auto_expire: z.boolean().default(true),
  dedup_strategy: z.enum(["latest", "highest_importance", "merge"]).default("latest"),
});

export async function GET() {
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("memory_policies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return dbErr("GET /api/memory-policies", error);
    return ok({ policies: data ?? [] });
  } catch (e) {
    console.error("GET /api/memory-policies: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(createPolicySchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("memory_policies")
      .insert(parsed.data)
      .select()
      .single();

    if (error) return dbErr("POST /api/memory-policies", error);
    return ok({ policy: data }, 201);
  } catch (e) {
    console.error("POST /api/memory-policies: uncaught", e);
    return err("internal_error", 500);
  }
}
