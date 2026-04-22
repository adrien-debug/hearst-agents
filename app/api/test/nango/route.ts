/**
 * Test Nango — Vérifie la connexion et liste les intégrations
 */

import { NextResponse } from "next/server";
import { getNangoClient, isNangoEnabled } from "@/lib/connectors/nango";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isNangoEnabled()) {
    return NextResponse.json(
      { status: "disabled", message: "NANGO_SECRET_KEY not set" },
      { status: 503 }
    );
  }

  try {
    const nango = getNangoClient();
    const integrations = await nango.listIntegrations();

    return NextResponse.json({
      status: "connected",
      message: "Nango is configured and responding",
      integrations: {
        count: integrations.configs?.length || 0,
        list: integrations.configs?.map((c: { unique_key: string; provider: string }) => ({
          key: c.unique_key,
          provider: c.provider,
        })) || [],
      },
      note: "Google (gmail, calendar, drive) use native OAuth — not Nango",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to connect to Nango",
      },
      { status: 502 }
    );
  }
}
