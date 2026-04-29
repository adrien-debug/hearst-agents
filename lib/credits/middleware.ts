/**
 * Credits middleware — `requireCredits(estimatedCost)` blocking guard
 * pour les routes API qui déclenchent un job lourd.
 *
 * Pattern d'usage côté tool handler :
 *
 *   const guard = await requireCreditsForJob({
 *     userId, tenantId, jobKind: "audio-gen", estimatedCostUsd: 0.05,
 *   });
 *   if (!guard.allowed) {
 *     return { ok: false, reason: "insufficient_credits", ... };
 *   }
 *   await enqueueJob({ ..., estimatedCostUsd: guard.estimatedCostUsd });
 *
 * Le coût estimé est calculé par le tool handler selon les params
 * (longueur du texte pour audio-gen, dimensions pour image-gen, etc.).
 * Voir lib/credits/estimators.ts (Phase B suivante) pour les formules.
 */

import { guardAndReserveCredits } from "./client";
import type { JobKind } from "@/lib/jobs/types";
import type { CreditGuardResult } from "./types";

export interface RequireCreditsArgs {
  userId: string;
  tenantId: string;
  jobKind: JobKind;
  estimatedCostUsd: number;
  jobId: string;
}

export async function requireCreditsForJob(args: RequireCreditsArgs): Promise<CreditGuardResult> {
  return guardAndReserveCredits(args);
}

/**
 * Format un message user-facing à surfacer dans le chat / toast quand
 * le solde est insuffisant. Phase B suivante : ajouter un CTA "Top up".
 */
export function formatInsufficientCreditsMessage(
  result: CreditGuardResult,
  jobKind: JobKind,
): string {
  const need = result.estimatedCostUsd.toFixed(4);
  const have = result.availableUsd.toFixed(4);
  return `Crédits insuffisants pour ${jobKind} : besoin de $${need}, solde disponible $${have}.`;
}
