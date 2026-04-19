/**
 * @deprecated Legacy v1 single-run endpoint (Supabase).
 * Use /api/v2/runs/[id] for the unified run detail.
 */
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
    // Cast to `any` for v2 tables not yet in database.types.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = requireServerSupabase() as any;

    const [runRes, tracesRes, stepsRes, approvalsRes, artifactsRes, logsRes] =
      await Promise.all([
        sb.from("runs").select("*").eq("id", id).single(),
        sb
          .from("traces")
          .select("*")
          .eq("run_id", id)
          .order("step_index", { ascending: true })
          .order("started_at", { ascending: true }),
        sb
          .from("run_steps")
          .select("*")
          .eq("run_id", id)
          .order("seq", { ascending: true }),
        sb
          .from("run_approvals")
          .select("*")
          .eq("run_id", id)
          .order("created_at", { ascending: true }),
        sb
          .from("artifacts")
          .select("id, type, title, status, format, summary, version, created_at, updated_at")
          .eq("run_id", id),
        sb
          .from("run_logs")
          .select("*")
          .eq("run_id", id)
          .order("at", { ascending: true })
          .limit(100),
      ]);

    if (runRes.error) return dbErr(`GET /api/runs/${id}`, runRes.error);

    return ok({
      run: runRes.data,
      traces: tracesRes.data ?? [],
      steps: stepsRes.data ?? [],
      approvals: approvalsRes.data ?? [],
      artifacts: artifactsRes.data ?? [],
      logs: logsRes.data ?? [],
    });
  } catch (e) {
    console.error(`GET /api/runs/${id}: uncaught`, e);
    return err("internal_error", 500);
  }
}
