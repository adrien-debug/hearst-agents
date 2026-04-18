import { NextRequest } from "next/server";
import type { Json } from "@/lib/database.types";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";
import { executeWorkflow } from "@/lib/runtime/workflow-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WORKFLOW_ID = process.env.DAILY_REPORT_WORKFLOW_ID ?? null;
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL ?? null;
const REPORT_TYPE = "crypto_daily";

// ─── AUTH ────────────────────────────────────────────────────────────

function authenticateCron(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/daily-report] CRON_SECRET not configured — all requests rejected");
    return { ok: false, reason: "cron_secret_not_configured" };
  }

  const auth = req.headers.get("authorization");

  if (!auth) {
    console.warn("[cron/daily-report] auth_rejected: no Authorization header", {
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return { ok: false, reason: "missing_authorization_header" };
  }

  if (auth !== `Bearer ${cronSecret}`) {
    console.warn("[cron/daily-report] auth_rejected: invalid secret", {
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return { ok: false, reason: "invalid_secret" };
  }

  return { ok: true };
}

// ─── IDEMPOTENCE ─────────────────────────────────────────────────────

type IdempotencyResult =
  | { action: "run" }
  | { action: "skip"; reason: string; existing_report_id: string }
  | { action: "retry"; reason: string; failed_report_id: string };

async function checkIdempotency(todayUTC: string): Promise<IdempotencyResult> {
  const sb = requireServerSupabase();

  const { data: existing } = await sb
    .from("daily_reports")
    .select("id, status, error_message")
    .eq("report_date", todayUTC)
    .eq("report_type", REPORT_TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) return { action: "run" };

  if (existing.status === "completed") {
    return {
      action: "skip",
      reason: `Report already completed for ${todayUTC}`,
      existing_report_id: existing.id,
    };
  }

  if (existing.status === "failed") {
    return {
      action: "retry",
      reason: `Previous run failed: ${existing.error_message ?? "unknown"}`,
      failed_report_id: existing.id,
    };
  }

  if (existing.status === "running") {
    return {
      action: "skip",
      reason: `Report already running for ${todayUTC}`,
      existing_report_id: existing.id,
    };
  }

  return { action: "run" };
}

// ─── ALERTING ────────────────────────────────────────────────────────

async function sendAlert(payload: {
  report_date: string;
  report_id: string;
  run_id: string | null;
  workflow_id: string;
  error: string;
}) {
  console.error("[cron/daily-report] ALERT:", JSON.stringify(payload));

  if (!ALERT_WEBHOOK_URL) return;

  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[Hearst] Daily Report FAILED\nDate: ${payload.report_date}\nReport: ${payload.report_id}\nRun: ${payload.run_id ?? "none"}\nWorkflow: ${payload.workflow_id}\nError: ${payload.error}`,
        ...payload,
      }),
    });
  } catch (e) {
    console.error("[cron/daily-report] alert webhook failed:", e);
  }
}

// ─── REPORT EXTRACTION ──────────────────────────────────────────────

function extractReport(output: unknown): {
  content_markdown: string;
  summary: string;
  highlights: unknown[];
} {
  let raw = "";
  if (typeof output === "string") {
    raw = output;
  } else if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    raw = typeof o.output === "string" ? o.output : JSON.stringify(output);
  }

  const lines = raw.split("\n").filter((l) => l.trim());
  const summary = lines.slice(0, 3).join(" ").slice(0, 500);

  const highlights: string[] = [];
  for (const line of lines) {
    if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
      highlights.push(line.replace(/^[-•*]\s*/, "").trim());
    }
    if (highlights.length >= 10) break;
  }

  return { content_markdown: raw, summary, highlights };
}

// ─── MAIN ────────────────────────────────────────────────────────────

async function runDailyReport(triggeredBy: string) {
  const sb = requireServerSupabase();
  const todayUTC = new Date().toISOString().slice(0, 10);

  const workflowId = WORKFLOW_ID ?? (await getActiveReportWorkflow());
  if (!workflowId) return err("no_daily_report_workflow_configured", 404);

  // ── Idempotency check
  const idempotency = await checkIdempotency(todayUTC);

  if (idempotency.action === "skip") {
    console.info("[cron/daily-report] idempotency:skip", idempotency.reason);
    return ok({
      status: "already_ran",
      reason: idempotency.reason,
      report_id: idempotency.existing_report_id,
      report_date: todayUTC,
    });
  }

  if (idempotency.action === "retry") {
    console.info("[cron/daily-report] idempotency:retry", idempotency.reason);
  }

  // ── Create report record (pending)
  const { data: report, error: insertError } = await sb
    .from("daily_reports")
    .insert({
      report_date: todayUTC,
      report_type: REPORT_TYPE,
      workflow_id: workflowId,
      status: "running",
      triggered_by: triggeredBy,
      idempotency_decision: idempotency.action,
    })
    .select("id")
    .single();

  if (insertError || !report) {
    console.error("[cron/daily-report] failed to create report record:", insertError);
    return err("report_record_creation_failed", 500);
  }

  const reportId = report.id;

  try {
    const result = await executeWorkflow(sb, workflowId, {
      mission: "Daily Crypto Market Report",
      date: todayUTC,
      triggered_by: triggeredBy,
      report_id: reportId,
    });

    // ── Update report with run_id
    await sb.from("daily_reports").update({ run_id: result.run_id }).eq("id", reportId);

    if (result.status === "failed") {
      await sb.from("daily_reports").update({
        status: "failed",
        error_message: result.error ?? "workflow_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", reportId);

      await sendAlert({
        report_date: todayUTC,
        report_id: reportId,
        run_id: result.run_id,
        workflow_id: workflowId,
        error: result.error ?? "workflow_failed",
      });

      return err(result.error ?? "workflow_failed", 500);
    }

    // ── Extract content and save
    const { content_markdown, summary, highlights } = extractReport(result.output);

    await sb.from("daily_reports").update({
      status: "completed",
      content_markdown,
      summary,
      highlights: highlights as Json,
      updated_at: new Date().toISOString(),
    }).eq("id", reportId);

    console.info("[cron/daily-report] completed", {
      report_id: reportId,
      run_id: result.run_id,
      date: todayUTC,
      content_length: content_markdown.length,
    });

    return ok({
      status: "completed",
      report_id: reportId,
      run_id: result.run_id,
      report_date: todayUTC,
      content_length: content_markdown.length,
      summary,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron/daily-report] uncaught error:", msg);

    await sb.from("daily_reports").update({
      status: "failed",
      error_message: msg,
      updated_at: new Date().toISOString(),
    }).eq("id", reportId);

    await sendAlert({
      report_date: todayUTC,
      report_id: reportId,
      run_id: null,
      workflow_id: workflowId,
      error: msg,
    });

    return err("internal_error", 500);
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = authenticateCron(req);
  if (!auth.ok) return err(auth.reason, 401);
  return runDailyReport("cron");
}

export async function POST(req: NextRequest) {
  const auth = authenticateCron(req);
  if (!auth.ok) return err(auth.reason, 401);

  let triggeredBy = "manual";
  try {
    const body = await req.json();
    triggeredBy = (body.triggered_by as string) ?? "manual";
  } catch {
    // no body is fine
  }

  return runDailyReport(triggeredBy);
}

// ─── HELPERS ─────────────────────────────────────────────────────────

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
