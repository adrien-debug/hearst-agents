import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = requireServerSupabase();
  const todayUTC = new Date().toISOString().slice(0, 10);

  const [todayResult, lastSuccessResult] = await Promise.all([
    sb.from("daily_reports")
      .select("*")
      .eq("report_date", todayUTC)
      .eq("report_type", "crypto_daily")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    sb.from("daily_reports")
      .select("report_date, created_at")
      .eq("report_type", "crypto_daily")
      .eq("status", "completed")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (todayResult.error) return err(todayResult.error.message, 500);

  if (!todayResult.data) {
    return ok({
      report_date: todayUTC,
      exists: false,
      status: "not_generated",
      message: "No report for today yet",
      last_success_date: lastSuccessResult.data?.report_date ?? null,
    });
  }

  return ok({
    report_date: todayUTC,
    exists: true,
    status: todayResult.data.status,
    report: todayResult.data,
    last_success_date: lastSuccessResult.data?.report_date ?? null,
  });
}
