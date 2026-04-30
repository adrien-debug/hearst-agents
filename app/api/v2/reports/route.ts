/**
 * GET /api/v2/reports
 *
 * Liste les reports catalogués (9 prédéfinis) + les custom specs (templates)
 * sauvegardés par le tenant. Retourne pour chaque entry :
 *   { id, title, description, domain, persona, requiredApps, kind }
 *
 * `kind` vaut "builtin" pour les rapports prédéfinis et "custom" pour les
 * templates personnalisés. La page /reports + le Studio utilisent ce flag
 * pour différencier l'UI (badge « Personnalisé », actions Cloner / Éditer).
 *
 * Pour la matrice d'applicabilité (status ready/partial), voir l'extension
 * de /api/v2/user/connections.
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { CATALOG } from "@/lib/reports/catalog";
import { listTemplates } from "@/lib/reports/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CatalogEntryDTO {
  id: string;
  title: string;
  description: string;
  domain: string;
  persona: string;
  requiredApps: ReadonlyArray<string>;
  kind: "builtin" | "custom";
}

export async function GET() {
  const { scope, error } = await requireScope({ context: "GET /api/v2/reports" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const builtin: CatalogEntryDTO[] = CATALOG.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    domain: c.domain,
    persona: c.persona,
    requiredApps: c.requiredApps,
    kind: "builtin",
  }));

  // Templates custom du tenant (best-effort : si Supabase indisponible → []).
  const templates = await listTemplates({ tenantId: scope.tenantId });
  const custom: CatalogEntryDTO[] = templates.map((t) => ({
    id: t.id,
    title: t.name,
    description: t.description ?? "",
    domain: t.domain,
    persona: "founder",
    requiredApps: [],
    kind: "custom",
  }));

  return NextResponse.json({
    catalog: [...builtin, ...custom],
    scope: { isDevFallback: scope.isDevFallback },
  });
}
