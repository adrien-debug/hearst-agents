/**
 * GET /api/reports — Discovery catalogue des rapports applicables au tenant.
 *
 * Retourne les rapports catalogue (prédéfinis) + les templates personnalisés,
 * chacun avec leur statut (ready | partial | needs-connection).
 *
 * Auth : session NextAuth requise via requireScope.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getApplicableReportsWithTemplates } from "@/lib/reports/catalog";
import { listTemplates } from "@/lib/reports/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { scope, error } = await requireScope({ context: "reports GET" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // Charger les apps connectées depuis la session de scope
  // En dev fallback, on retourne une liste vide → tous les rapports sont "needs-connection"
  // TODO(phase-B): lire les apps connectées depuis le store tenant Supabase
  const connectedApps: string[] = [];

  // Charger les templates personnalisés du tenant
  const templates = await listTemplates({ tenantId: scope.tenantId });

  const reports = getApplicableReportsWithTemplates(connectedApps, templates ?? []);

  // Mapper "blocked" (non exposé côté UI) comme "needs-connection" pour la discovery
  const payload = reports.map((r) => ({
    ...r,
    // `getApplicableReports` filtre déjà les "blocked" — on garde le statut tel quel
    // mais on ajoute cadence depuis le catalogue pour l'affichage UI
  }));

  return NextResponse.json({ reports: payload });
}
