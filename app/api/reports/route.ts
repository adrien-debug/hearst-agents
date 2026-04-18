import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const params = req.nextUrl.searchParams;

  const type = params.get("type") ?? undefined;
  const status = params.get("status") ?? undefined;
  const limit = Math.min(Number(params.get("limit") ?? 30), 100);
  const offset = Number(params.get("offset") ?? 0);

  let query = sb
    .from("daily_reports")
    .select("id, report_date, report_type, status, summary, triggered_by, run_id, workflow_id, error_message, idempotency_decision, created_at, updated_at")
    .order("report_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq("report_type", type);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return err(error.message, 500);

  return ok({ reports: data ?? [], count: data?.length ?? 0 });
}
