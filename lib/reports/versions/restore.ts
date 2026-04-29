/**
 * restoreVersion — restaure un report à une version précédente.
 *
 * Comportement :
 *  - Charge le spec_snapshot de la version cible.
 *  - Appelle runReport(spec_snapshot) pour produire un résultat frais.
 *  - Crée une NOUVELLE version (pas d'écrasement de l'historique).
 *  - La nouvelle version a triggered_by = "manual" et contient le nouveau run.
 *
 * Principe : l'historique est immuable. Restaurer = créer une version N+1
 * qui repart du spec d'une version passée.
 */

import { z } from "zod";
import { getVersion } from "@/lib/reports/versions/store";
import { createVersion } from "@/lib/reports/versions/store";
import type { VersionSummary } from "@/lib/reports/versions/store";
import { runReport, type RunReportOptions } from "@/lib/reports/engine/run-report";
import { parseReportSpec } from "@/lib/reports/spec/schema";

// ── Schéma ────────────────────────────────────────────────────

export const restoreVersionInputSchema = z.object({
  assetId: z.string().min(1).max(200),
  versionNumber: z.number().int().min(1),
  tenantId: z.string().min(1).max(120),
  /** userId pour la traçabilité (non stocké côté version mais logué). */
  userId: z.string().min(1).max(120).optional(),
});
export type RestoreVersionInput = z.infer<typeof restoreVersionInputSchema>;

export type RestoreVersionOutcome =
  | { ok: true; newVersion: VersionSummary }
  | { ok: false; reason: "version_not_found" | "invalid_spec" | "run_failed" | "persist_failed" | "unavailable" };

// ── restoreVersion ────────────────────────────────────────────

/**
 * Restaure un report en rejouant le spec_snapshot de la version `versionNumber`.
 * Crée une nouvelle version avec le résultat du re-run.
 *
 * @param options  RunReportOptions injectables (sourceLoader, noCache, etc.)
 */
export async function restoreVersion(
  rawInput: RestoreVersionInput,
  options: RunReportOptions = {},
): Promise<RestoreVersionOutcome> {
  const input = restoreVersionInputSchema.parse(rawInput);

  // 1. Charge la version cible
  const version = await getVersion({
    assetId: input.assetId,
    versionNumber: input.versionNumber,
    tenantId: input.tenantId,
  });
  if (!version) {
    return { ok: false, reason: "version_not_found" };
  }

  // 2. Parse + valide le spec_snapshot
  const specParsed = parseReportSpec(version.specSnapshot);
  if (!specParsed) {
    return { ok: false, reason: "invalid_spec" };
  }

  // 3. Re-run le rapport avec le spec restauré
  let runResult: Awaited<ReturnType<typeof runReport>>;
  try {
    runResult = await runReport(specParsed, {
      ...options,
      noCache: true, // force un run frais, pas de cache sur restauration
    });
  } catch (err) {
    console.error("[restoreVersion] runReport a throw:", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "run_failed" };
  }

  // 4. Crée une nouvelle version avec le résultat du re-run
  const newVersion = await createVersion({
    assetId: input.assetId,
    tenantId: input.tenantId,
    spec: version.specSnapshot as Record<string, unknown>,
    renderPayload: runResult.payload as unknown as Record<string, unknown>,
    signals: runResult.signals,
    narration: runResult.narration,
    triggeredBy: "manual",
  });

  if (!newVersion) {
    return { ok: false, reason: "persist_failed" };
  }

  console.log(
    `[restoreVersion] asset=${input.assetId} restauré depuis v${input.versionNumber} → nouvelle v${newVersion.versionNumber}` +
    (input.userId ? ` par user=${input.userId}` : ""),
  );

  return { ok: true, newVersion };
}
