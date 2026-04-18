import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = requireServerSupabase();
  const todayUTC = new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("daily_reports")
    .select("*")
    .eq("report_date", todayUTC)
    .eq("report_type", "crypto_daily")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return err(error.message, 500);

  if (!data) {
    return ok({
      report_date: todayUTC,
      exists: false,
      status: "not_generated",
      message: "No report for today yet",
    });
  }

  return ok({
    report_date: todayUTC,
    exists: true,
    report: data,
  });
}
