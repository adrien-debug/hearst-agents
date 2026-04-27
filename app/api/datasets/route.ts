import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err, dbErr, parseBody } from "@/lib/domain";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createDatasetSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  agent_id: z.string().uuid().optional(),
});

export async function GET() {
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("datasets")
      .select("id, name, description, agent_id, created_at, agents(name)")
      .order("created_at", { ascending: false });

    if (error) return dbErr("GET /api/datasets", error);
    return ok({ datasets: data ?? [] });
  } catch (e) {
    console.error("GET /api/datasets: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(createDatasetSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("datasets")
      .insert({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        agent_id: parsed.data.agent_id ?? null,
      })
      .select()
      .single();

    if (error) return dbErr("POST /api/datasets", error);
    return ok({ dataset: data }, 201);
  } catch (e) {
    console.error("POST /api/datasets: uncaught", e);
    return err("internal_error", 500);
  }
}
