import type { Json } from "@/lib/database.types";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";
import { executeWorkflow } from "./workflow-engine";

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL ?? null;

export interface ReportConfig {
  reportType: string;
  label: string;
  workflowIdEnvVar: string;
  workflowNamePattern: string;
  missionLabel: string;
}

// ─── AUTH ────────────────────────────────────────────────────────────

export function authenticateCron(
  authHeader: string | null,
  logPrefix: string,
  ip: string,
): { ok: true } | { ok: false; reason: string } {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(`[${logPrefix}] CRON_SECRET not configured — all requests rejected`);
    return { ok: false, reason: "cron_secret_not_configured" };
  }

  if (!authHeader) {
    console.warn(`[${logPrefix}] auth_rejected: no Authorization header`, { ip });
    return { ok: false, reason: "missing_authorization_header" };
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn(`[${logPrefix}] auth_rejected: invalid secret`, { ip });
    return { ok: false, reason: "invalid_secret" };
  }

  return { ok: true };
}

// ─── IDEMPOTENCE ─────────────────────────────────────────────────────

type IdempotencyResult =
  | { action: "run" }
  | { action: "skip"; reason: string; existing_report_id: string }
  | { action: "retry"; reason: string; failed_report_id: string };

export async function checkIdempotency(
  dateUTC: string,
  reportType: string,
  forceRerun: boolean,
): Promise<IdempotencyResult> {
  const sb = requireServerSupabase();

  const { data: existing } = await sb
    .from("daily_reports")
    .select("id, status, error_message")
    .eq("report_date", dateUTC)
    .eq("report_type", reportType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) return { action: "run" };

  if (existing.status === "completed" && !forceRerun) {
    return { action: "skip", reason: `Report already completed for ${dateUTC}`, existing_report_id: existing.id };
  }

  if (existing.status === "completed" && forceRerun) {
    return { action: "retry", reason: `Force rerun requested for ${dateUTC}`, failed_report_id: existing.id };
  }

  if (existing.status === "failed") {
    return { action: "retry", reason: `Previous run failed: ${existing.error_message ?? "unknown"}`, failed_report_id: existing.id };
  }

  if (existing.status === "running") {
    return { action: "skip", reason: `Report already running for ${dateUTC}`, existing_report_id: existing.id };
  }

  return { action: "run" };
}

// ─── ALERTING ────────────────────────────────────────────────────────

export async function sendAlert(
  logPrefix: string,
  label: string,
  payload: { report_date: string; report_id: string; run_id: string | null; workflow_id: string; error: string },
) {
  console.error(`[${logPrefix}] [ALERT] ${label} FAILED | date=${payload.report_date} report=${payload.report_id} run=${payload.run_id ?? "none"} error=${payload.error}`);

  if (!ALERT_WEBHOOK_URL) return;

  const message = `**[Hearst] ${label} FAILED**\nDate: \`${payload.report_date}\`\nReport: \`${payload.report_id}\`\nRun: \`${payload.run_id ?? "none"}\`\nWorkflow: \`${payload.workflow_id}\`\nError: ${payload.error}`;

  try {
    const isDiscord = ALERT_WEBHOOK_URL.includes("discord.com/api/webhooks");
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isDiscord ? { content: message } : { text: message, ...payload }),
    });
  } catch (e) {
    console.error(`[${logPrefix}] alert webhook failed:`, e);
  }
}

// ─── REPORT EXTRACTION ──────────────────────────────────────────────

export function extractReport(output: unknown): {
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

// ─── MAIN RUNNER ─────────────────────────────────────────────────────

export async function runReport(
  config: ReportConfig,
  triggeredBy: string,
  dateOverride?: string,
  rerunReason?: string,
  forceRerun = false,
) {
  const sb = requireServerSupabase();
  const dateUTC = dateOverride ?? new Date().toISOString().slice(0, 10);
  const logPrefix = `cron/${config.reportType}`;

  const workflowId = process.env[config.workflowIdEnvVar] ?? (await findWorkflow(config.workflowNamePattern));
  if (!workflowId) return err(`no_${config.reportType}_workflow_configured`, 404);

  const idempotency = await checkIdempotency(dateUTC, config.reportType, forceRerun);

  if (idempotency.action === "skip") {
    console.info(`[${logPrefix}] idempotency:skip`, idempotency.reason);
    return ok({ status: "already_ran", reason: idempotency.reason, report_id: idempotency.existing_report_id, report_date: dateUTC });
  }

  if (idempotency.action === "retry") {
    console.info(`[${logPrefix}] idempotency:retry`, idempotency.reason);
  }

  const { data: report, error: insertError } = await sb
    .from("daily_reports")
    .insert({
      report_date: dateUTC,
      report_type: config.reportType,
      workflow_id: workflowId,
      status: "running",
      triggered_by: triggeredBy,
      idempotency_decision: idempotency.action,
      error_message: rerunReason ? `rerun_reason: ${rerunReason}` : null,
    })
    .select("id")
    .single();

  if (insertError || !report) {
    console.error(`[${logPrefix}] failed to create report record:`, insertError);
    return err("report_record_creation_failed", 500);
  }

  const reportId = report.id;

  try {
    const result = await executeWorkflow(sb, workflowId, {
      mission: config.missionLabel,
      date: dateUTC,
      triggered_by: triggeredBy,
      report_id: reportId,
      ...(rerunReason ? { rerun_reason: rerunReason } : {}),
    });

    await sb.from("daily_reports").update({ run_id: result.run_id }).eq("id", reportId);

    if (result.status === "failed") {
      await sb.from("daily_reports").update({
        status: "failed",
        error_message: result.error ?? "workflow_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", reportId);

      await sendAlert(logPrefix, config.label, {
        report_date: dateUTC, report_id: reportId, run_id: result.run_id, workflow_id: workflowId, error: result.error ?? "workflow_failed",
      });

      return err(result.error ?? "workflow_failed", 500);
    }

    const { content_markdown, summary, highlights } = extractReport(result.output);

    await sb.from("daily_reports").update({
      status: "completed",
      content_markdown,
      summary,
      highlights: highlights as Json,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", reportId);

    console.info(`[${logPrefix}] completed`, { report_id: reportId, run_id: result.run_id, date: dateUTC, content_length: content_markdown.length });

    return ok({ status: "completed", report_id: reportId, run_id: result.run_id, report_date: dateUTC, content_length: content_markdown.length, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${logPrefix}] uncaught error:`, msg);

    await sb.from("daily_reports").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", reportId);
    await sendAlert(logPrefix, config.label, { report_date: dateUTC, report_id: reportId, run_id: null, workflow_id: workflowId, error: msg });

    return err("internal_error", 500);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────

async function findWorkflow(namePattern: string): Promise<string | null> {
  const sb = requireServerSupabase();
  const { data } = await sb
    .from("workflows")
    .select("id")
    .ilike("name", `%${namePattern}%`)
    .eq("status", "active")
    .limit(1)
    .single();
  return data?.id ?? null;
}

export function parseCronBody(body: unknown): {
  triggeredBy: string;
  dateOverride?: string;
  rerunReason?: string;
  forceRerun: boolean;
} {
  const b = body as Record<string, unknown> | null;
  if (!b) return { triggeredBy: "manual", forceRerun: false };

  return {
    triggeredBy: (b.triggered_by as string) ?? "manual",
    dateOverride: b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date as string) ? (b.date as string) : undefined,
    rerunReason: b.reason ? String(b.reason) : undefined,
    forceRerun: b.force === true,
  };
}
