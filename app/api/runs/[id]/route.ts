import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err, dbErr } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sb = requireServerSupabase();

    const [runRes, tracesRes] = await Promise.all([
      sb.from("runs").select("*").eq("id", id).single(),
      sb
        .from("traces")
        .select("*")
        .eq("run_id", id)
        .order("step_index", { ascending: true })
        .order("started_at", { ascending: true }),
    ]);

    if (runRes.error) return dbErr(`GET /api/runs/${id}`, runRes.error);

    return ok({
      run: runRes.data,
      traces: tracesRes.data ?? [],
    });
  } catch (e) {
    console.error(`GET /api/runs/${id}: uncaught`, e);
    return err("internal_error", 500);
  }
}
