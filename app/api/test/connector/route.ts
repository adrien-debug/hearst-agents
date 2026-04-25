/**
 * Test Connector — Demo avec Router (Phase A)
 *
 * Teste le système de routing Pack → Nango → Legacy.
 * TODO: Mettre à jour avec nouveau context Router quand Phase B démarre.
 */

import { NextRequest, NextResponse } from "next/server";
// TODO: Phase B — réintégrer avec nouveau Router
// import { routeConnectorRequest, getRouterStats } from "@/lib/connectors/router";
import { getUserId } from "@/lib/get-user-id";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const provider = searchParams.get("provider") || "gmail";
  const action = searchParams.get("action") || "list";

  // Phase A: Router créé mais pas encore branché au runtime
  // Phase B: Réactiver avec vrai appel routeConnectorRequest

  return NextResponse.json({
    status: "Phase A — Connector Router créé",
    message: "Router disponible dans lib/connectors/router.ts",
    provider,
    action,
    userId,
    note: "Integration runtime dans Phase B (Finance Agent)",
    routerStats: {
      availablePacks: 1, // finance-pack
      legacyConnectors: 12,
      routingTable: [
        { id: "stripe", source: "pack" },
        { id: "gmail", source: "nango" },
        { id: "slack", source: "nango" },
      ],
    },
    timestamp: new Date().toISOString(),
  });
}
