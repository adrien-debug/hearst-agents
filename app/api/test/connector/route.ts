/**
 * Test Connector — Demo avec Google (natif)
 *
 * Teste le système de routing avec les connecteurs Google déjà configurés.
 * Pas besoin de Nango pour Google — OAuth natif déjà en place.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeConnector, isProviderConnected } from "@/lib/connectors/router";
import { getUserId } from "@/lib/get-user-id";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const provider = searchParams.get("provider") || "gmail";
  const action = searchParams.get("action") || "getEmails";

  // Vérifier si le provider est connecté
  const connected = await isProviderConnected(userId, provider);
  if (!connected) {
    return NextResponse.json(
      {
        error: "not_connected",
        message: `${provider} not connected. Connect via /admin/integrations`,
        provider,
        action,
        connected: false,
      },
      { status: 403 }
    );
  }

  try {
    const _startTime = Date.now();

    // Exécuter l'action via le router
    const result = await executeConnector(
      {
        provider,
        action,
        input: { limit: 5 },
      },
      { userId, tenantId: "default" }
    );

    return NextResponse.json({
      success: result.success,
      provider,
      action,
      via: result.via, // "native" pour Google
      latencyMs: result.latencyMs,
      data: result.data,
      error: result.error,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[TestConnector] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider,
        action,
      },
      { status: 500 }
    );
  }
}
