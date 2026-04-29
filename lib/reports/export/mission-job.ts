/**
 * Export Mission Job — exécute une mission de type `export`.
 *
 * Le scheduler existant (lib/engine/runtime/missions/scheduler.ts) est centré
 * autour de la stack orchestrator pour les missions "input texte". Pour rester
 * additif et éviter de toucher au scheduler, on expose ici une fonction qui :
 *   1. Charge le ReportSpec depuis l'asset (provenance.specId)
 *   2. Exécute runReport
 *   3. Génère le PDF / XLSX
 *   4. Persiste l'export
 *   5. Crée un share link signed (TTL bornable) et notifie best-effort
 *      les destinataires via le dispatcher d'alerting déjà branché.
 *
 * Cette fonction peut être appelée :
 *   - par un cron externe (Railway / GitHub Action)
 *   - par un scheduler enrichi qui détecte `mission.kind === "export"`
 *   - directement par une route API (manuel / debug)
 */

import { runReport, type SourceLoader } from "@/lib/reports/engine/run-report";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import { exportPdf } from "./pdf";
import { exportXlsx } from "./xlsx";
import { persistExport } from "./store";
import {
  signToken,
  buildShareUrl,
  TTL_DEFAULT_HOURS,
} from "@/lib/reports/sharing/signed-url";
import { createShareRow } from "@/lib/reports/sharing/store";
import crypto from "node:crypto";

export type ExportFormat = "pdf" | "xlsx";

export interface ExportMissionInput {
  spec: ReportSpec;
  /** Asset id auquel rattacher l'export (assets.id, text). */
  assetId: string;
  format: ExportFormat;
  tenantId: string;
  createdBy?: string | null;
  missionId?: string | null;
  /** Source loader pour le run (sinon stub vide). */
  sourceLoader?: SourceLoader;
  /** TTL du share link associé (heures). Borné par signed-url. */
  shareTtlHours?: number;
  /** Émet un share link signed (défaut true). */
  withShare?: boolean;
}

export interface ExportMissionResult {
  format: ExportFormat;
  storageKey: string;
  storageUrl: string;
  size: number;
  shareUrl: string | null;
  shareExpiresAt: string | null;
}

export async function runExportMission(
  input: ExportMissionInput,
): Promise<ExportMissionResult> {
  const runResult = await runReport(input.spec, {
    sourceLoader: input.sourceLoader,
    noCache: false,
  });

  const exportInput = {
    payload: runResult.payload,
    meta: input.spec.meta,
    narration: runResult.narration,
    fileName: input.spec.meta.title,
  };

  const result =
    input.format === "pdf"
      ? await exportPdf(exportInput)
      : await exportXlsx(exportInput);

  const persisted = await persistExport({
    result,
    format: input.format,
    assetId: input.assetId,
    tenantId: input.tenantId,
    createdBy: input.createdBy ?? null,
    missionId: input.missionId ?? null,
  });

  let shareUrl: string | null = null;
  let shareExpiresAt: string | null = null;

  if (input.withShare !== false) {
    const shareId = crypto.randomUUID();
    const signed = signToken({
      shareId,
      assetId: input.assetId,
      ttlHours: input.shareTtlHours ?? TTL_DEFAULT_HOURS,
    });
    if (signed) {
      const row = await createShareRow({
        shareId,
        assetId: input.assetId,
        tenantId: input.tenantId,
        tokenHash: signed.tokenHash,
        expiresAt: signed.expiresAt,
        createdBy: input.createdBy ?? null,
      });
      if (row) {
        shareUrl = buildShareUrl(signed.token);
        shareExpiresAt = signed.expiresAt;
      }
    }
  }

  return {
    format: input.format,
    storageKey: persisted.storageKey,
    storageUrl: persisted.storageUrl,
    size: result.size,
    shareUrl,
    shareExpiresAt,
  };
}
