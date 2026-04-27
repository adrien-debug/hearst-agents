import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const todayUTC = new Date().toISOString().slice(0, 10);
  const type = req.nextUrl.searchParams.get("type") ?? "crypto_daily";

  const [todayResult, lastSuccessResult] = await Promise.all([
    sb.from("daily_reports")
      .select("*")
      .eq("report_date", todayUTC)
      .eq("report_type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    sb.from("daily_reports")
      .select("report_date, created_at")
      .eq("report_type", type)
      .eq("status", "completed")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (todayResult.error) return err(todayResult.error.message, 500);

  if (!todayResult.data) {
    return ok({
      report_type: type,
      report_date: todayUTC,
      exists: false,
      status: "not_generated",
      last_success_date: lastSuccessResult.data?.report_date ?? null,
    });
  }

  return ok({
    report_type: type,
    report_date: todayUTC,
    exists: true,
    status: todayResult.data.status,
    report: todayResult.data,
    last_success_date: lastSuccessResult.data?.report_date ?? null,
  });
}
