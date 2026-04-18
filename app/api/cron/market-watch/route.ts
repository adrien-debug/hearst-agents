import { NextRequest } from "next/server";
import { err } from "@/lib/domain";
import { authenticateCron, runReport, parseCronBody, type ReportConfig } from "@/lib/runtime/report-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CONFIG: ReportConfig = {
  reportType: "market_watch",
  label: "Market Watch Report",
  workflowIdEnvVar: "MARKET_WATCH_WORKFLOW_ID",
  workflowNamePattern: "market%watch",
  missionLabel: "Market Watch Intelligence Report",
};

export async function GET(req: NextRequest) {
  const auth = authenticateCron(
    req.headers.get("authorization"),
    "cron/market_watch",
    req.headers.get("x-forwarded-for") ?? "unknown",
  );
  if (!auth.ok) return err(auth.reason, 401);
  return runReport(CONFIG, "cron");
}

export async function POST(req: NextRequest) {
  const auth = authenticateCron(
    req.headers.get("authorization"),
    "cron/market_watch",
    req.headers.get("x-forwarded-for") ?? "unknown",
  );
  if (!auth.ok) return err(auth.reason, 401);

  const defaults = { triggeredBy: "manual", forceRerun: false, dateOverride: undefined as string | undefined, rerunReason: undefined as string | undefined };
  let body: unknown = null;
  try { body = await req.json(); } catch { /* no body is fine */ }
  const params = body ? parseCronBody(body) : defaults;

  return runReport(CONFIG, params.triggeredBy, params.dateOverride, params.rerunReason, params.forceRerun);
}
