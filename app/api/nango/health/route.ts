/**
 * Nango Health Check
 *
 * Verifies Nango connection and returns available integrations count.
 */

import { NextResponse } from "next/server";
import { getNangoClient, isNangoEnabled } from "@/lib/connectors/nango";
import { INITIAL_NANGO_CONNECTORS } from "@/lib/connectors/nango/connectors";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isNangoEnabled()) {
    return NextResponse.json(
      { status: "disabled", message: "NANGO_SECRET_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    const nango = getNangoClient();
    const integrations = await nango.listIntegrations();

    return NextResponse.json({
      status: "healthy",
      configured: integrations.configs?.length || 0,
      readyToEnable: INITIAL_NANGO_CONNECTORS.length,
      providers: INITIAL_NANGO_CONNECTORS.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
      })),
    });
  } catch (error) {
    console.error("[NangoHealth] Check failed:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
