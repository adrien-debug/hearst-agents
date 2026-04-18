import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";
import { executeWorkflow } from "@/lib/runtime/workflow-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WORKFLOW_ID = process.env.DAILY_REPORT_WORKFLOW_ID ?? null;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return err("unauthorized", 401);
    }
  }

  const workflowId = WORKFLOW_ID ?? (await getActiveReportWorkflow());
  if (!workflowId) return err("no_daily_report_workflow_configured", 404);

  try {
    const sb = requireServerSupabase();
    const result = await executeWorkflow(sb, workflowId, {
      mission: "Daily Crypto Market Report",
      date: new Date().toISOString().slice(0, 10),
      triggered_by: "cron",
    });

    if (result.status === "failed") {
      console.error("daily-report cron failed:", result.error);
      return err(result.error ?? "workflow_failed", 500);
    }

    return ok({
      run_id: result.run_id,
      status: result.status,
      output_length: typeof result.output === "string" ? result.output.length : JSON.stringify(result.output).length,
    });
  } catch (e) {
    console.error("daily-report cron uncaught:", e);
    return err("internal_error", 500);
  }
}

async function getActiveReportWorkflow(): Promise<string | null> {
  const sb = requireServerSupabase();
  const { data } = await sb
    .from("workflows")
    .select("id")
    .ilike("name", "%daily%report%")
    .eq("status", "active")
    .limit(1)
    .single();
  return data?.id ?? null;
}

export async function GET() {
  return ok({ endpoint: "daily-report-cron", method: "POST" });
}
