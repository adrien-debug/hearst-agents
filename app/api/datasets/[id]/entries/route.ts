import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err, dbErr, parseBody } from "@/lib/domain";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createEntrySchema = z.object({
  input: z.string().min(1),
  expected_output: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("dataset_entries")
      .select("*")
      .eq("dataset_id", id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) return dbErr(`GET /api/datasets/${id}/entries`, error);
    return ok({ entries: data ?? [] });
  } catch (e) {
    console.error(`GET /api/datasets/${id}/entries: uncaught`, e);
    return err("internal_error", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = parseBody(createEntrySchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("dataset_entries")
      .insert({
        dataset_id: id,
        input: parsed.data.input,
        expected_output: parsed.data.expected_output,
        tags: parsed.data.tags,
      })
      .select()
      .single();

    if (error) return dbErr(`POST /api/datasets/${id}/entries`, error);
    return ok({ entry: data }, 201);
  } catch (e) {
    console.error(`POST /api/datasets/${id}/entries: uncaught`, e);
    return err("internal_error", 500);
  }
}
