import type { Json } from "@/lib/database.types";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err } from "@/lib/domain";
import { executeWorkflow } from "./workflow-engine";

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL ?? null;

export interface ReportConfig {
  reportType: string;
  label: string;
  workflowIdEnvVar: string;
  workflowNamePattern: string;
  missionLabel: string;
  /** If true, workflow may return NO_SIGNAL → status = skipped. Default: false. */
  conditionalExecution?: boolean;
  /** Cooldown window in hours — prevents duplicate reports within this window for same report_type. Default: none (daily idempotence). */
  cooldownHours?: number;
}

// ─── SIGNAL TAXONOMY ────────────────────────────────────────────────
//
// Crypto/markets signals (legacy V1) : flash_move, volume_spike, …
// Business signals (V2 reports cross-app) : mrr_drop, runway_risk, …
// Les deux unions cohabitent : `SignalType` = union des deux.

export const CRYPTO_SIGNAL_TYPES = [
  "flash_move",
  "volume_spike",
  "new_trending",
  "defi_stress",
] as const;
export type CryptoSignalType = (typeof CRYPTO_SIGNAL_TYPES)[number];

export const BUSINESS_SIGNAL_TYPES = [
  "mrr_drop",
  "mrr_spike",
  "pipeline_thin",
  "runway_risk",
  "cycle_time_drift",
  "customer_at_risk",
  "support_overload",
  "commit_velocity_drop",
  "calendar_overload",
  "auth_expiring",
] as const;
export type BusinessSignalType = (typeof BUSINESS_SIGNAL_TYPES)[number];

export const SIGNAL_TYPES = [
  ...CRYPTO_SIGNAL_TYPES,
  ...BUSINESS_SIGNAL_TYPES,
] as const;
export type SignalType = CryptoSignalType | BusinessSignalType;

export type Severity = "info" | "warning" | "critical";

export const NO_SIGNAL_MARKER = "NO_SIGNAL";

export interface AlertMeta {
  signal_types: SignalType[];
  severity: Severity;
}

/**
 * Severity par signal — défaut info, escalade pour signaux critiques.
 * Les business signals critiques (mrr_drop sévère, runway_risk) sont escalés
 * à `warning` ou `critical` par l'extracteur business via `extractSignals()`,
 * pas ici. Cette fonction reste sur la sémantique legacy crypto + safe defaults.
 */
export function determineSeverity(signals: SignalType[]): Severity {
  if (signals.includes("flash_move")) return "critical";
  if (signals.includes("defi_stress") || signals.includes("volume_spike")) return "warning";
  if (signals.includes("mrr_drop") || signals.includes("runway_risk")) return "critical";
  if (
    signals.includes("pipeline_thin") ||
    signals.includes("cycle_time_drift") ||
    signals.includes("customer_at_risk") ||
    signals.includes("support_overload")
  ) {
    return "warning";
  }
  if (signals.length > 0) return "info";
  return "info";
}

export function parseAlertMeta(output: string): AlertMeta | null {
  const signalMatch = output.match(/SIGNAL_TYPES:\s*\[([^\]]*)\]/);
  if (!signalMatch) return null;
  const raw = signalMatch[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
  const signals = raw.filter((s): s is SignalType =>
    (SIGNAL_TYPES as readonly string[]).includes(s),
  );
  if (signals.length === 0) return null;
  return { signal_types: signals, severity: determineSeverity(signals) };
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

// ─── COOLDOWN ───────────────────────────────────────────────────────

export async function checkCooldown(
  reportType: string,
  cooldownHours: number,
): Promise<{ blocked: boolean; reason?: string; existing_report_id?: string }> {
  const sb = requireServerSupabase();
  const cutoff = new Date(Date.now() - cooldownHours * 3600_000).toISOString();

  const { data } = await sb
    .from("daily_reports")
    .select("id, created_at, status")
    .eq("report_type", reportType)
    .in("status", ["completed", "running"])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    return { blocked: true, reason: `Cooldown active: last ${data.status} report ${data.id} at ${data.created_at} (within ${cooldownHours}h window)`, existing_report_id: data.id };
  }
  return { blocked: false };
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

  // Cooldown-based idempotence (for event-driven reports)
  if (config.cooldownHours && !forceRerun) {
    const cooldown = await checkCooldown(config.reportType, config.cooldownHours);
    if (cooldown.blocked) {
      console.info(`[${logPrefix}] cooldown:blocked`, cooldown.reason);
      return ok({ status: "cooldown_blocked", reason: cooldown.reason, report_id: cooldown.existing_report_id, report_date: dateUTC });
    }
  }

  // Standard daily idempotence (for scheduled reports)
  if (!config.cooldownHours) {
    const idempotency = await checkIdempotency(dateUTC, config.reportType, forceRerun);
    if (idempotency.action === "skip") {
      console.info(`[${logPrefix}] idempotency:skip`, idempotency.reason);
      return ok({ status: "already_ran", reason: idempotency.reason, report_id: idempotency.existing_report_id, report_date: dateUTC });
    }
    if (idempotency.action === "retry") {
      console.info(`[${logPrefix}] idempotency:retry`, idempotency.reason);
    }
  }

  const { data: report, error: insertError } = await sb
    .from("daily_reports")
    .insert({
      report_date: dateUTC,
      report_type: config.reportType,
      workflow_id: workflowId,
      status: "running",
      triggered_by: triggeredBy,
      idempotency_decision: config.cooldownHours ? "cooldown_passed" : "run",
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

    // Conditional execution: detect NO_SIGNAL from workflow output
    if (config.conditionalExecution && content_markdown.includes(NO_SIGNAL_MARKER)) {
      await sb.from("daily_reports").update({
        status: "skipped",
        summary: "No significant market signal detected",
        idempotency_decision: "no_signal",
        content_markdown: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", reportId);

      console.info(`[${logPrefix}] no_signal`, { report_id: reportId, run_id: result.run_id, date: dateUTC });
      return ok({ status: "no_signal", report_id: reportId, run_id: result.run_id, report_date: dateUTC });
    }

    // Parse alert metadata (signal_types + severity) for conditional reports
    let alertMeta: AlertMeta | null = null;
    if (config.conditionalExecution) {
      alertMeta = parseAlertMeta(content_markdown);
    }

    const enrichedHighlights = alertMeta
      ? [
          `severity: ${alertMeta.severity}`,
          `signal_types: ${alertMeta.signal_types.join(", ")}`,
          ...highlights,
        ]
      : highlights;

    const enrichedSummary = alertMeta
      ? `[${alertMeta.severity.toUpperCase()}] ${summary}`
      : summary;

    await sb.from("daily_reports").update({
      status: "completed",
      content_markdown,
      summary: enrichedSummary,
      highlights: enrichedHighlights as Json,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", reportId);

    console.info(`[${logPrefix}] completed`, {
      report_id: reportId, run_id: result.run_id, date: dateUTC,
      content_length: content_markdown.length,
      ...(alertMeta ? { severity: alertMeta.severity, signals: alertMeta.signal_types } : {}),
    });

    // Send webhook for real alerts (not for no_signal, not for failures handled above)
    if (alertMeta && ALERT_WEBHOOK_URL) {
      const severityEmoji = alertMeta.severity === "critical" ? "🔴" : alertMeta.severity === "warning" ? "🟡" : "🔵";
      const message = `${severityEmoji} **[Hearst] ${config.label} — ${alertMeta.severity.toUpperCase()}**\nSignals: ${alertMeta.signal_types.join(", ")}\nDate: \`${dateUTC}\`\nReport: \`${reportId}\`\n${enrichedSummary}`;
      try {
        const isDiscord = ALERT_WEBHOOK_URL.includes("discord.com/api/webhooks");
        await fetch(ALERT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isDiscord ? { content: message } : { text: message }),
        });
      } catch (e) {
        console.error(`[${logPrefix}] alert notification webhook failed:`, e);
      }
    }

    return ok({
      status: "completed", report_id: reportId, run_id: result.run_id, report_date: dateUTC,
      content_length: content_markdown.length, summary: enrichedSummary,
      ...(alertMeta ? { severity: alertMeta.severity, signal_types: alertMeta.signal_types } : {}),
    });
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
