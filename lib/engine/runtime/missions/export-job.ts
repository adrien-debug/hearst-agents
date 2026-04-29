/**
 * Job export_scheduled_report — exécuté après chaque run réussi d'une mission
 * schedulée dont `autoExport.enabled === true`.
 *
 * Flow :
 *   1. Charge le ReportSpec depuis l'asset (assetId)
 *   2. Lance runExportMission (run-report + export PDF/Excel)
 *   3. Notifie les recipients par email (best-effort via EmailSender)
 *
 * Si lib/reports/export/* n'est pas encore initialisé côté tenant, le job
 * échoue proprement avec un log d'erreur — il ne bloque pas le scheduler.
 */

import { z } from "zod";
import type { AutoExportConfig } from "./types";
import { getEmailSender } from "@/lib/notifications/channels";

// ── Zod schema du payload job ────────────────────────────────

export const exportScheduledReportPayloadSchema = z.object({
  /** UUID de l'asset report (kind="report") à exporter. */
  assetId: z.string().uuid("assetId doit être un UUID"),
  tenantId: z.string().min(1, "tenantId requis"),
  /** ID de la mission à l'origine du job (pour traçabilité). */
  missionId: z.string().min(1, "missionId requis"),
  /** Format d'export. "excel" est normalisé vers "xlsx" pour la lib export. */
  format: z.enum(["pdf", "excel"]),
  /** Emails des destinataires. Skip silencieux si vide après validation. */
  recipients: z.array(z.string().email()).min(1, "au moins un destinataire"),
});

export type ExportScheduledReportPayload = z.infer<
  typeof exportScheduledReportPayloadSchema
>;

// ── Résultat du job ──────────────────────────────────────────

export interface ExportJobResult {
  ok: boolean;
  format: "pdf" | "excel";
  assetId: string;
  storageKey?: string;
  shareUrl?: string | null;
  emailsSent: number;
  error?: string;
}

// ── Helpers ─────────────────────────────────────────────────

function formatLabel(format: "pdf" | "excel"): string {
  return format === "pdf" ? "PDF" : "Excel";
}

/**
 * Envoie un email de notification aux recipients avec le lien de partage.
 * Best-effort : une erreur d'envoi ne fail pas le job.
 */
async function notifyRecipients(
  recipients: string[],
  opts: {
    reportTitle: string;
    format: "pdf" | "excel";
    shareUrl: string | null;
    missionId: string;
  },
): Promise<number> {
  if (recipients.length === 0) return 0;

  const sender = getEmailSender();
  const fmt = formatLabel(opts.format);
  const subject = `[Hearst OS] Export ${fmt} automatique — ${opts.reportTitle}`;
  const linkLine = opts.shareUrl
    ? `Lien de téléchargement : ${opts.shareUrl}`
    : `(lien indisponible — vérifier la configuration storage)`;
  const text = [
    `Votre export ${fmt} planifié est prêt.`,
    "",
    `Rapport : ${opts.reportTitle}`,
    linkLine,
    "",
    `Mission : ${opts.missionId}`,
    `Généré le : ${new Date().toISOString()}`,
  ].join("\n");

  try {
    const res = await sender.send({ to: recipients, subject, text });
    if (!res.ok) {
      console.warn(
        `[export-job] email non envoyé (${res.error}) — mission ${opts.missionId}`,
      );
      return 0;
    }
    return recipients.length;
  } catch (err) {
    console.error(
      `[export-job] erreur email (mission ${opts.missionId}):`,
      err,
    );
    return 0;
  }
}

// ── Entrée principale ────────────────────────────────────────

/**
 * Exécute le job d'export planifié.
 *
 * @param rawPayload - payload brut (validé par Zod en interne)
 * @param deps - injections pour tests (getSpec, runExport)
 */
export async function runExportScheduledReportJob(
  rawPayload: unknown,
  deps?: {
    /** Charge le ReportSpec depuis l'asset. */
    getSpec?: (assetId: string, tenantId: string) => Promise<import("@/lib/reports/spec/schema").ReportSpec | null>;
    /** Exécute l'export (run-report + persit + share). */
    runExport?: (input: import("@/lib/reports/export/mission-job").ExportMissionInput) => Promise<import("@/lib/reports/export/mission-job").ExportMissionResult>;
  },
): Promise<ExportJobResult> {
  // ── Validation du payload ──────────────────────────────────
  const parsed = exportScheduledReportPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    console.error(`[export-job] payload invalide: ${msg}`);
    return {
      ok: false,
      format: "pdf",
      assetId: String((rawPayload as Record<string, unknown>)?.assetId ?? ""),
      emailsSent: 0,
      error: `payload invalide: ${msg}`,
    };
  }

  const { assetId, tenantId, missionId, format, recipients } = parsed.data;

  // ── Récupération du spec ───────────────────────────────────
  let spec: import("@/lib/reports/spec/schema").ReportSpec | null = null;
  try {
    const loader =
      deps?.getSpec ??
      (async () => {
        // TODO: brancher sur lib/engine/runtime/assets/ quand le store assets
        // sera stabilisé. En attendant, on throw pour rendre le bug visible.
        throw new Error(
          `Export module not yet initialized — getSpec non fourni pour assetId ${assetId}`,
        );
      });
    spec = await loader(assetId, tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[export-job] getSpec failed (asset=${assetId}): ${msg}`);
    return { ok: false, format, assetId, emailsSent: 0, error: msg };
  }

  if (!spec) {
    console.error(`[export-job] spec introuvable pour assetId=${assetId}`);
    return {
      ok: false,
      format,
      assetId,
      emailsSent: 0,
      error: `spec introuvable pour assetId ${assetId}`,
    };
  }

  // ── Export ─────────────────────────────────────────────────
  const xlsxFormat = format === "excel" ? "xlsx" : "pdf";
  let exportResult: import("@/lib/reports/export/mission-job").ExportMissionResult;
  try {
    const runner =
      deps?.runExport ??
      (async (input) => {
        const { runExportMission } = await import(
          "@/lib/reports/export/mission-job"
        );
        return runExportMission(input);
      });

    exportResult = await runner({
      spec,
      assetId,
      format: xlsxFormat as "pdf" | "xlsx",
      tenantId,
      missionId,
      withShare: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[export-job] export failed (asset=${assetId}): ${msg}`);
    return { ok: false, format, assetId, emailsSent: 0, error: msg };
  }

  // ── Notification email ─────────────────────────────────────
  const emailsSent = await notifyRecipients(recipients, {
    reportTitle: spec.meta.title,
    format,
    shareUrl: exportResult.shareUrl,
    missionId,
  });

  console.log(
    `[export-job] ok — format=${format} asset=${assetId} size=${exportResult.size} emails=${emailsSent}`,
  );

  return {
    ok: true,
    format,
    assetId,
    storageKey: exportResult.storageKey,
    shareUrl: exportResult.shareUrl,
    emailsSent,
  };
}

/**
 * Construit le payload job depuis la config autoExport d'une mission.
 */
export function buildExportJobPayload(
  missionId: string,
  tenantId: string,
  autoExport: AutoExportConfig,
): ExportScheduledReportPayload {
  return {
    assetId: autoExport.reportId,
    tenantId,
    missionId,
    format: autoExport.format,
    recipients: autoExport.recipients,
  };
}
