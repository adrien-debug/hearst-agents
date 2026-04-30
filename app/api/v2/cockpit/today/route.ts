/**
 * GET /api/v2/cockpit/today
 *
 * Source de vérité unique pour la home Stage (mode="cockpit").
 * Agrège briefing, missions running, watchlist, suggestions et reports
 * favoris derrière un seul endpoint pour minimiser le round-trip au mount.
 *
 * Voir lib/cockpit/today.ts pour la logique d'orchestration et fail-soft.
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getCockpitToday } from "@/lib/cockpit/today";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { scope, error } = await requireScope({ context: "GET /api/v2/cockpit/today" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  try {
    const payload = await getCockpitToday({
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    });

    return NextResponse.json({
      ...payload,
      scope: { isDevFallback: scope.isDevFallback },
    });
  } catch (err) {
    console.error("[GET /api/v2/cockpit/today] uncaught", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
