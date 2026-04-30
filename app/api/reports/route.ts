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
import {
  CATALOG,
  getApplicableReportsWithTemplates,
  type ApplicableReport,
} from "@/lib/reports/catalog";
import { listTemplates } from "@/lib/reports/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Construit la liste complète du catalogue (incluant les rapports "blocked"
 * qui n'ont aucune app connectée) pour la Discovery UI. Les rapports blocked
 * apparaissent avec un CTA "Connecter" grisé pointant vers /apps — la page
 * /reports affiche TOUJOURS le catalogue, jamais d'écran de blocage.
 */
function buildFullCatalog(connectedApps: ReadonlyArray<string>): ApplicableReport[] {
  const connected = new Set(connectedApps.map((a) => a.toLowerCase()));
  return CATALOG.map((entry) => {
    const missing = entry.requiredApps.filter((a) => !connected.has(a.toLowerCase()));
    const hits = entry.requiredApps.length - missing.length;
    let status: ApplicableReport["status"];
    if (hits === entry.requiredApps.length) status = "ready";
    else if (hits > 0) status = "partial";
    else status = "blocked";
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      domain: entry.domain,
      persona: entry.persona,
      requiredApps: entry.requiredApps,
      missingApps: missing,
      status,
      source: "catalog",
    };
  });
}

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

  // Catalogue complet (incluant blocked) + templates custom du tenant.
  // On combine manuellement pour préserver les rapports blocked qui sont
  // filtrés par `getApplicableReportsWithTemplates`.
  const fullCatalog = buildFullCatalog(connectedApps);
  const merged = getApplicableReportsWithTemplates(connectedApps, templates ?? []);
  const customOnly = merged.filter((r) => r.source === "custom");

  const reports: ApplicableReport[] = [...fullCatalog, ...customOnly];

  return NextResponse.json({ reports });
}
