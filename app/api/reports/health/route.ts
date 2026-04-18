import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const todayUTC = new Date().toISOString().slice(0, 10);
  const type = req.nextUrl.searchParams.get("type") ?? "crypto_daily";

  const [todayResult, lastSuccessResult, lastFailureResult, recentResult] = await Promise.all([
    sb.from("daily_reports")
      .select("id, status, created_at")
      .eq("report_date", todayUTC)
      .eq("report_type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    sb.from("daily_reports")
      .select("id, report_date, created_at")
      .eq("report_type", type)
      .eq("status", "completed")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),

    sb.from("daily_reports")
      .select("id, report_date, error_message, created_at")
      .eq("report_type", type)
      .eq("status", "failed")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),

    sb.from("daily_reports")
      .select("report_date, status")
      .eq("report_type", type)
      .in("status", ["completed", "failed"])
      .order("report_date", { ascending: false })
      .limit(14),
  ]);

  if (todayResult.error || lastSuccessResult.error || lastFailureResult.error || recentResult.error) {
    return err("db_error", 500);
  }

  const today = todayResult.data;
  const lastSuccess = lastSuccessResult.data;
  const lastFailure = lastFailureResult.data;
  const recent = recentResult.data ?? [];

  let streak = 0;
  for (const r of recent) {
    if (r.status === "completed") streak++;
    else break;
  }

  const totalRecent = recent.length;
  const successCount = recent.filter((r) => r.status === "completed").length;

  return ok({
    report_type: type,
    report_date: todayUTC,
    today: today
      ? { status: today.status, report_id: today.id, generated_at: today.created_at }
      : { status: "not_generated" },
    last_success: lastSuccess
      ? { report_date: lastSuccess.report_date, report_id: lastSuccess.id }
      : null,
    last_failure: lastFailure
      ? { report_date: lastFailure.report_date, report_id: lastFailure.id, error: lastFailure.error_message }
      : null,
    streak_consecutive_success: streak,
    recent_14d: {
      total: totalRecent,
      success: successCount,
      failed: totalRecent - successCount,
      success_rate: totalRecent > 0 ? Math.round((successCount / totalRecent) * 100) : null,
    },
  });
}
