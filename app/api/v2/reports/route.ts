/**
 * GET /api/v2/reports
 *
 * Liste les reports catalogués + les reports utilisateur (V2 — pas encore
 * stockés). Retourne pour chaque entry :
 *   { id, title, description, domain, persona, requiredApps }
 *
 * Pour la matrice d'applicabilité (status ready/partial), voir l'extension
 * de /api/v2/user/connections.
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { CATALOG } from "@/lib/reports/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const { scope, error } = await requireScope({ context: "GET /api/v2/reports" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const entries = CATALOG.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    domain: c.domain,
    persona: c.persona,
    requiredApps: c.requiredApps,
  }));

  return NextResponse.json({
    catalog: entries,
    scope: { isDevFallback: scope.isDevFallback },
  });
}
